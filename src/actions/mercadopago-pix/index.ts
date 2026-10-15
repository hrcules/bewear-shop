"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { mpCheckoutTable, orderTable } from "@/db/schema";
import { mpFetch } from "@/lib/mercadopago/api";
import { connectionToken } from "@/lib/mercadopago/connection";
import { authenticatedAction } from "@/lib/safe-action";

const inputSchema = z.object({ orderId: z.string().uuid() });

const pixPaymentSchema = z.object({
  status: z.string(),
  payment_method_id: z.string().optional(),
  date_of_expiration: z.string().nullish(),
  point_of_interaction: z
    .object({
      transaction_data: z
        .object({
          qr_code: z.string().nullish(),
          qr_code_base64: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

export type PendingPaymentResult =
  | { kind: "paid" }
  | {
      kind: "pix";
      qrCode: string;
      qrCodeBase64: string | null;
      expiresAt: string | null;
    }
  | { kind: "checkout"; url: string }
  | { kind: "none" };

/**
 * Para pedidos pendentes pagos via Mercado Pago: devolve o QR Code Pix já
 * gerado (consultado na API, com o token do lojista) ou, se não houver Pix
 * pendente, o link do checkout para o cliente continuar pagando.
 */
export const getPendingPayment = authenticatedAction<
  { orderId: string },
  PendingPaymentResult
>(async (data, ctx) => {
  const { orderId } = inputSchema.parse(data);

  const order = await db.query.orderTable.findFirst({
    where: eq(orderTable.id, orderId),
  });
  if (!order || order.userId !== ctx.userId || order.storeId !== ctx.storeId) {
    throw new Error("Pedido não encontrado ou não autorizado.");
  }
  if (order.status === "paid") return { kind: "paid" };
  if (order.status !== "pending") return { kind: "none" };

  const checkout = await db.query.mpCheckoutTable.findFirst({
    where: eq(mpCheckoutTable.orderId, orderId),
  });
  if (!checkout) return { kind: "none" };

  if (
    checkout.paymentId &&
    ["pending", "in_process"].includes(checkout.lastPaymentStatus ?? "")
  ) {
    try {
      const connection = await connectionToken(ctx.storeId);
      const payment = pixPaymentSchema.parse(
        await mpFetch(`/v1/payments/${checkout.paymentId}`, {
          token: connection.token,
        }),
      );
      const transaction = payment.point_of_interaction?.transaction_data;
      const expired =
        payment.date_of_expiration &&
        new Date(payment.date_of_expiration).getTime() < Date.now();

      if (
        payment.payment_method_id === "pix" &&
        payment.status === "pending" &&
        transaction?.qr_code &&
        !expired
      ) {
        return {
          kind: "pix",
          qrCode: transaction.qr_code,
          qrCodeBase64: transaction.qr_code_base64 ?? null,
          expiresAt: payment.date_of_expiration ?? null,
        };
      }
    } catch (error) {
      console.error("Mercado Pago: falha ao buscar Pix pendente", {
        orderId,
        message: error instanceof Error ? error.message : "erro desconhecido",
      });
    }
  }

  if (checkout.checkoutUrl && checkout.expiresAt.getTime() > Date.now()) {
    return { kind: "checkout", url: checkout.checkoutUrl };
  }
  return { kind: "none" };
});
