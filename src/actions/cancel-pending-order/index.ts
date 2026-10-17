"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { mpCheckoutTable, orderTable, storeTable } from "@/db/schema";
import { MpApiError, mpFetch } from "@/lib/mercadopago/api";
import { cancelPendingOrder } from "@/lib/mercadopago/cancel";
import { connectionToken } from "@/lib/mercadopago/connection";
import { processPayment } from "@/lib/mercadopago/payments";
import { authenticatedAction } from "@/lib/safe-action";

const inputSchema = z.object({ orderId: z.string().uuid() });
const paymentStatusSchema = z.object({ status: z.string() });

/**
 * O cliente cancela um pedido que ainda aguarda pagamento. Se havia um Pix
 * gerado, ele é cancelado no Mercado Pago antes (senão poderia ser pago depois
 * de o pedido ser cancelado). Devolve o estoque.
 */
export const cancelPendingOrderAction = authenticatedAction<
  { orderId: string },
  { success: true }
>(async (data, ctx) => {
  const { orderId } = inputSchema.parse(data);

  const order = await db.query.orderTable.findFirst({
    where: eq(orderTable.id, orderId),
  });
  if (!order || order.userId !== ctx.userId || order.storeId !== ctx.storeId) {
    throw new Error("Pedido não encontrado ou não autorizado.");
  }
  if (order.status !== "pending") {
    throw new Error("Este pedido não está mais aguardando pagamento.");
  }

  // Em lojas só de catálogo o lojista gerencia os pedidos pendentes.
  const store = await db.query.storeTable.findFirst({
    where: eq(storeTable.id, ctx.storeId),
  });
  if (!store?.enableOnlinePayments) {
    throw new Error("Este pedido não pode ser cancelado por aqui.");
  }

  const checkout = await db.query.mpCheckoutTable.findFirst({
    where: eq(mpCheckoutTable.orderId, orderId),
  });

  if (checkout) {
    const connection = await connectionToken(ctx.storeId).catch(() => null);

    // 1) Há pagamento em andamento? Confere o estado real no Mercado Pago.
    if (checkout.paymentId) {
      if (!connection) {
        throw new Error(
          "Não foi possível cancelar agora. Tente novamente em instantes.",
        );
      }
      try {
        const payment = paymentStatusSchema.parse(
          await mpFetch(`/v1/payments/${checkout.paymentId}`, {
            token: connection.token,
          }),
        );

        if (payment.status === "approved") {
          await processPayment(ctx.storeId, checkout.paymentId);
          revalidatePath("/orders");
          throw new Error(
            "O pagamento deste pedido acabou de ser aprovado, então ele não pode mais ser cancelado.",
          );
        }
        if (payment.status === "in_process") {
          throw new Error(
            "O pagamento está em análise pelo Mercado Pago. Aguarde o resultado antes de cancelar.",
          );
        }
        if (payment.status === "pending") {
          // Pix gerado e não pago: cancela lá antes, para não ser pago depois.
          await mpFetch(`/v1/payments/${checkout.paymentId}`, {
            token: connection.token,
            method: "PUT",
            body: { status: "cancelled" },
          });
        }
      } catch (error) {
        if (error instanceof MpApiError) {
          throw new Error(
            "Não foi possível cancelar o pagamento no Mercado Pago agora. Tente novamente em instantes.",
          );
        }
        throw error;
      }
    }

    // 2) Melhor esforço: fecha o link do checkout para não aceitar mais
    // pagamento. Se falhar, o webhook ainda sinaliza qualquer pagamento tardio.
    if (connection && checkout.preferenceId) {
      await mpFetch(`/checkout/preferences/${checkout.preferenceId}`, {
        token: connection.token,
        method: "PUT",
        body: {
          expires: true,
          expiration_date_to: new Date(Date.now() - 3 * 60 * 60 * 1000)
            .toISOString()
            .replace("Z", "-03:00"),
        },
      }).catch(() => undefined);
    }
  }

  const cancelled = await cancelPendingOrder(
    orderId,
    ctx.storeId,
    "cancelled",
  );
  if (!cancelled) {
    // Cancelar o Pix no Mercado Pago dispara o webhook, que pode ter cancelado
    // o pedido primeiro. Se o resultado é o mesmo, para o cliente deu certo.
    const current = await db.query.orderTable.findFirst({
      where: eq(orderTable.id, orderId),
    });
    if (current?.status !== "cancelled") {
      throw new Error("Este pedido não está mais aguardando pagamento.");
    }
  }

  revalidatePath("/orders");
  return { success: true };
});
