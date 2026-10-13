import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import MercadoPagoConfig, { Payment } from "mercadopago";

import { db } from "@/db";
import {
  orderTable,
  orderItemTable,
  productVariantTable,
  storeTable,
  user,
  notificationTable,
} from "@/db/schema";
import {
  sendCustomerReceiptEmail,
  sendStoreOwnerNotificationEmail,
} from "@/lib/email";
import { formatCentsToBRL } from "@/helpers/money";

export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");

    if (!storeId) {
      return new NextResponse("storeId ausente na URL do Webhook", {
        status: 400,
      });
    }

    const store = await db.query.storeTable.findFirst({
      where: eq(storeTable.id, storeId),
    });

    if (!store || !store.mpAccessToken) {
      return new NextResponse(
        "Loja não encontrada ou Mercado Pago não configurado",
        { status: 400 },
      );
    }

    const body = await request.json();
    const paymentId = body?.data?.id || body?.id;

    if (!paymentId) {
      return new NextResponse("ID de pagamento não encontrado", {
        status: 400,
      });
    }

    const client = new MercadoPagoConfig({ accessToken: store.mpAccessToken });
    const payment = new Payment(client);

    const mpPayment = await payment.get({ id: paymentId });
    const orderId = mpPayment.external_reference;

    if (!orderId) {
      console.log(
        "⚠️ [Webhook MP] Pagamento sem external_reference. Ignorando...",
      );
      return new NextResponse("Pedido não encontrado", { status: 400 });
    }

    // ==========================================
    // CENÁRIO 1: PIX PAGO COM SUCESSO! 🟢
    // ==========================================
    if (mpPayment.status === "approved") {
      const order = await db.query.orderTable.findFirst({
        where: and(
          eq(orderTable.id, orderId),
          eq(orderTable.storeId, store.id), // 🛡️ Trava Multi-tenant de leitura
        ),
        with: { shippingAddress: true },
      });

      if (!order) {
        return new NextResponse("Pedido não pertence a esta loja", {
          status: 403,
        });
      }

      if (order.status === "paid") {
        return NextResponse.json({ received: true });
      }

      await db
        .update(orderTable)
        .set({ status: "paid", updatedAt: new Date() })
        .where(
          and(
            eq(orderTable.id, orderId),
            eq(orderTable.storeId, store.id), // 🛡️ Trava Multi-tenant de escrita
          ),
        );

      console.log(
        `🟢 [Webhook MP] Pagamento Aprovado! Loja: ${store.name} | Pedido: #${order.orderNumber}`,
      );

      try {
        const emailOrderItems = await db.query.orderItemTable.findMany({
          where: eq(orderItemTable.orderId, orderId),
          with: { productVariant: { with: { product: true } } },
        });

        if (order.shippingAddress) {
          const owner = await db.query.user.findFirst({
            where: eq(user.id, store.ownerId),
          });

          const subtotalInCents = emailOrderItems.reduce(
            (acc, item) => acc + item.priceInCents * item.quantity,
            0,
          );
          const freteInCents = order.totalPriceInCents - subtotalInCents;

          const formattedItems = emailOrderItems.map((item) => ({
            name: `${item.productVariant.product.name} (${item.productVariant.name})`,
            quantity: item.quantity,
            priceFormatted: formatCentsToBRL(item.priceInCents * item.quantity),
          }));

          const formattedSubtotal = formatCentsToBRL(subtotalInCents);
          const formattedShipping = formatCentsToBRL(freteInCents);
          const formattedTotal = formatCentsToBRL(order.totalPriceInCents);

          await sendCustomerReceiptEmail(
            order.shippingAddress.email,
            order.shippingAddress.fullName,
            order.orderNumber,
            store.name,
            formattedItems,
            formattedSubtotal,
            formattedShipping,
            formattedTotal,
            store.enableOnlinePayments,
          );

          if (owner && owner.email) {
            await sendStoreOwnerNotificationEmail(
              owner.email,
              order.orderNumber,
              store.name,
              formattedItems,
              formattedSubtotal,
              formattedShipping,
              formattedTotal,
              store.enableOnlinePayments,
            );

            await db.insert(notificationTable).values({
              userId: owner.id,
              title: "💰 Nova Venda Realizada!",
              message: `O pedido #${order.orderNumber} no valor de ${formattedTotal} acabou de ser pago via PIX.`,
              type: "sale",
            });
          }
        }
      } catch (error) {
        console.error("❌ [Webhook MP] Erro no envio de e-mails:", error);
      }
    }

    // ==========================================
    // CENÁRIO 2: PIX EXPIRADO OU CANCELADO! 🔴
    // ==========================================
    else if (
      mpPayment.status === "cancelled" ||
      mpPayment.status === "rejected"
    ) {
      const order = await db.query.orderTable.findFirst({
        where: and(
          eq(orderTable.id, orderId),
          eq(orderTable.storeId, store.id), // 🛡️ Trava Multi-tenant
        ),
      });

      if (!order) {
        return new NextResponse("Pedido não pertence a esta loja", {
          status: 403,
        });
      }

      if (order.status === "pending") {
        console.log(
          `🔴 [Webhook MP] PIX Cancelado. Pedido: #${order.orderNumber}. Estornando estoque...`,
        );

        await db
          .update(orderTable)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(
            and(
              eq(orderTable.id, orderId),
              eq(orderTable.storeId, store.id), // 🛡️ Trava Multi-tenant
            ),
          );

        const orderItems = await db.query.orderItemTable.findMany({
          where: eq(orderItemTable.orderId, orderId),
        });

        for (const item of orderItems) {
          try {
            await db
              .update(productVariantTable)
              .set({
                stock: sql`${productVariantTable.stock} + ${item.quantity}`,
              })
              .where(eq(productVariantTable.id, item.productVariantId));
          } catch (error) {
            console.error(
              `❌ [Webhook MP] Erro ao repor estoque do item ${item.productVariantId}:`,
              error,
            );
          }
        }
        console.log("✅ [Webhook MP] Estoque do PIX estornado com sucesso!");
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("❌ [Webhook MP] Erro geral:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
};
