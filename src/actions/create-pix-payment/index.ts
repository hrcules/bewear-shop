"use server";

import { eq } from "drizzle-orm";
import MercadoPagoConfig, { Payment } from "mercadopago";

import { db } from "@/db";
import { orderItemTable, orderTable, storeTable } from "@/db/schema";
import { calculateShipping } from "@/helpers/shipping";
import { authenticatedAction } from "@/lib/safe-action";

import { CreatePixPaymentSchema, createPixPaymentSchema } from "./schema";

export const createPixPaymentAction = authenticatedAction<
  CreatePixPaymentSchema,
  { success: boolean }
>(async (data, ctx) => {
  const { userId, storeId } = ctx;

  const { orderId } = createPixPaymentSchema.parse(data);

  const order = await db.query.orderTable.findFirst({
    where: eq(orderTable.id, orderId),
    with: { shippingAddress: true },
  });

  if (!order || order.userId !== userId || order.storeId !== storeId) {
    throw new Error("Pedido não encontrado ou não autorizado.");
  }

  const store = await db.query.storeTable.findFirst({
    where: eq(storeTable.id, storeId),
  });

  if (!store || !store.mpAccessToken) {
    throw new Error("Esta loja não configurou o Mercado Pago.");
  }

  const orderItems = await db.query.orderItemTable.findMany({
    where: eq(orderItemTable.orderId, orderId),
  });

  const subtotalInCents = orderItems.reduce(
    (acc, item) => acc + item.priceInCents * item.quantity,
    0,
  );

  const freteInCents = calculateShipping(
    subtotalInCents,
    store.fixedShippingFeeInCents || 0,
    store.freeShippingThresholdInCents || null,
  );

  let finalSubtotalInCents = subtotalInCents;

  if (store.pixDiscountPercent > 0) {
    const discountAmount = Math.round(
      (subtotalInCents * store.pixDiscountPercent) / 100,
    );
    finalSubtotalInCents = subtotalInCents - discountAmount;
  }

  const totalInCents = finalSubtotalInCents + freteInCents;
  const totalInBRL = Number((totalInCents / 100).toFixed(2));

  const client = new MercadoPagoConfig({
    accessToken: store.mpAccessToken,
  });
  const payment = new Payment(client);

  const expireDate = new Date();
  expireDate.setMinutes(expireDate.getMinutes() + 30);

  const fullName = order.shippingAddress?.fullName || "Cliente Bewear";
  const names = fullName.split(" ");
  const firstName = names[0];
  const lastName = names.slice(1).join(" ") || "Desconhecido";

  const rawCpf = order.shippingAddress?.cpf || "";
  const cleanCpf = rawCpf.replace(/\D/g, "") || "00000000000";

  try {
    const result = await payment.create({
      body: {
        transaction_amount: totalInBRL,
        payment_method_id: "pix",
        date_of_expiration: expireDate.toISOString(),
        payer: {
          email: order.shippingAddress?.email || "email@cliente.com",
          first_name: firstName,
          last_name: lastName,
          identification: {
            type: "CPF",
            number: cleanCpf,
          },
        },
        external_reference: orderId,
        description: `Compra na loja ${store.name} - Pedido #${order.orderNumber}`,
      },
    });

    await db
      .update(orderTable)
      .set({
        pixQrCode: result.point_of_interaction?.transaction_data?.qr_code,
        pixQrCodeBase64:
          result.point_of_interaction?.transaction_data?.qr_code_base64,
        pixPaymentId: String(result.id),
        totalPriceInCents: totalInCents,
      })
      .where(eq(orderTable.id, orderId));

    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("❌ Erro MP Detalhado:", error.message, error.cause);
    } else {
      console.error("❌ Erro MP Desconhecido:", error);
    }
    throw new Error("Falha ao gerar o PIX. Verifique os dados do cliente.");
  }
});
