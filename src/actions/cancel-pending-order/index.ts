"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { mpCheckoutTable, orderTable, storeTable } from "@/db/schema";
import { cancelOrderWithPayment } from "@/lib/mercadopago/cancel";
import { connectionToken } from "@/lib/mercadopago/connection";
import { authenticatedAction } from "@/lib/safe-action";

const inputSchema = z.object({ orderId: z.string().uuid() });

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
  const connection = checkout
    ? await connectionToken(ctx.storeId).catch(() => null)
    : null;

  const outcome = await cancelOrderWithPayment(orderId, ctx.storeId, {
    connection,
    allowLocal: !checkout,
  });
  revalidatePath("/orders");

  if (outcome === "paid") {
    throw new Error(
      "O pagamento deste pedido acabou de ser aprovado, então ele não pode mais ser cancelado.",
    );
  }
  if (outcome === "in_process") {
    throw new Error(
      "O pagamento está em análise pelo Mercado Pago. Aguarde o resultado antes de cancelar.",
    );
  }
  if (outcome === "mp_unavailable") {
    throw new Error(
      "Não foi possível cancelar o pagamento no Mercado Pago agora. Tente novamente em instantes.",
    );
  }
  return { success: true };
});
