import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

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
  const text = await request.text();

  let unverifiedEvent;
  try {
    unverifiedEvent = JSON.parse(text);
  } catch (err) {
    console.error("❌ [Webhook] Falha: O corpo não é um JSON válido.");
    return new NextResponse("JSON Inválido", { status: 400 });
  }

  const storeId = unverifiedEvent?.data?.object?.metadata?.storeId;

  if (!storeId) {
    return new NextResponse("storeId ausente no metadata", { status: 400 });
  }

  const store = await db.query.storeTable.findFirst({
    where: eq(storeTable.id, storeId),
  });

  if (!store || !store.stripeSecretKey || !store.stripeWebhookSecret) {
    return new NextResponse("Chaves não configuradas", { status: 400 });
  }

  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return new NextResponse("Assinatura ausente", { status: 400 });
  }

  const cleanWebhookSecret = store.stripeWebhookSecret.replace(/['"\s]/g, "");
  const cleanSecretKey = store.stripeSecretKey.replace(/['"\s]/g, "");

  const stripe = new Stripe(cleanSecretKey);
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(text, signature, cleanWebhookSecret);
  } catch (error: unknown) {
    console.error("❌ [Webhook] Erro na assinatura:", (error as Error).message);
    return new NextResponse(`Erro na assinatura: ${(error as Error).message}`, {
      status: 400,
    });
  }

  // ==========================================
  // CENÁRIO 1: PAGAMENTO APROVADO
  // ==========================================
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;

    if (!orderId) {
      return new NextResponse("Pedido não encontrado", { status: 400 });
    }

    await db
      .update(orderTable)
      .set({ status: "paid" })
      .where(and(eq(orderTable.id, orderId), eq(orderTable.storeId, store.id)));

    try {
      const order = await db.query.orderTable.findFirst({
        where: and(
          eq(orderTable.id, orderId),
          eq(orderTable.storeId, store.id),
        ),
        with: { shippingAddress: true },
      });

      if (!order) {
        return new NextResponse("Pedido não pertence a esta loja", {
          status: 403,
        });
      }

      console.log(
        `🟢 [Webhook] Pagamento Aprovado! Loja: ${store.name} | Pedido: #${order.orderNumber}`,
      );

      const emailOrderItems = await db.query.orderItemTable.findMany({
        where: eq(orderItemTable.orderId, orderId),
        with: {
          productVariant: {
            with: { product: true },
          },
        },
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
            message: `O pedido #${order.orderNumber} no valor de ${formattedTotal} acabou de ser pago via Cartão.`,
            type: "sale",
          });
        }
      }
    } catch (emailError) {
      console.error(
        "❌ [Webhook] Erro no bloco de processamento/e-mails:",
        emailError,
      );
    }
  }

  // ==========================================
  // CENÁRIO 2: SESSÃO EXPIRADA OU FALHOU
  // ==========================================
  else if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;

    if (!orderId) {
      return new NextResponse("Pedido não encontrado no metadata", {
        status: 400,
      });
    }

    console.log(
      `🔴 [Webhook] Sessão expirada/falhou. Cancelando pedido ${orderId} e estornando estoque...`,
    );

    await db
      .update(orderTable)
      .set({ status: "cancelled" })
      .where(and(eq(orderTable.id, orderId), eq(orderTable.storeId, store.id)));

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
          `❌ [Webhook] Erro ao repor estoque do item ${item.productVariantId}:`,
          error,
        );
      }
    }

    console.log("✅ [Webhook] Estoque estornado com sucesso.");
  }

  return NextResponse.json({ received: true });
};
