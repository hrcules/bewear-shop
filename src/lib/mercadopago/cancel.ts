import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  mpCheckoutTable,
  orderItemTable,
  orderTable,
  productVariantTable,
} from "@/db/schema";

import { MpApiError, mpFetch } from "./api";
import { connectionToken, storePaymentLock } from "./connection";
import { cancelPixReminder } from "./notify";
import { processPayment } from "./payments";

/**
 * Cancela o pedido (só se ainda estiver pendente) e devolve o estoque, no mesmo
 * lock que o webhook usa, então não corre contra uma confirmação de pagamento.
 * Retorna false se o pedido já não estava pendente.
 */
export async function cancelPendingOrder(
  orderId: string,
  storeId: string,
  checkoutStatus: "expired" | "cancelled",
) {
  const cancelled = await db.transaction(async (tx) => {
    await tx.execute(storePaymentLock(storeId));

    const [order] = await tx
      .select()
      .from(orderTable)
      .where(eq(orderTable.id, orderId))
      .for("update");
    if (!order || order.status !== "pending") return false;

    await tx
      .update(orderTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(orderTable.id, orderId));

    const items = await tx
      .select()
      .from(orderItemTable)
      .where(eq(orderItemTable.orderId, orderId));
    for (const item of items) {
      await tx
        .update(productVariantTable)
        .set({ stock: sql`${productVariantTable.stock} + ${item.quantity}` })
        .where(eq(productVariantTable.id, item.productVariantId));
    }

    await tx
      .update(mpCheckoutTable)
      .set({ status: checkoutStatus, updatedAt: new Date() })
      .where(eq(mpCheckoutTable.orderId, orderId));

    return true;
  });

  if (cancelled) await cancelPixReminder(orderId);
  return cancelled;
}

const paymentStatusSchema = z.object({ status: z.string() });

export type CancelOutcome =
  | "cancelled"
  | "paid" // o pagamento foi aprovado: o pedido não pode mais ser cancelado
  | "in_process" // em análise no Mercado Pago: precisa esperar o resultado
  | "mp_unavailable"; // não foi possível falar com o Mercado Pago

/**
 * Cancela um pedido pendente cuidando do pagamento: confere o estado real no
 * Mercado Pago, cancela o Pix gerado (para não ser pago depois) e devolve o
 * estoque. Sem `connection` só cancela localmente se `allowLocal` permitir.
 */
export async function cancelOrderWithPayment(
  orderId: string,
  storeId: string,
  options: { connection: { token: string } | null; allowLocal: boolean },
): Promise<CancelOutcome> {
  const { connection, allowLocal } = options;

  const checkout = await db.query.mpCheckoutTable.findFirst({
    where: eq(mpCheckoutTable.orderId, orderId),
  });

  if (checkout?.paymentId) {
    if (!connection) {
      if (!allowLocal) return "mp_unavailable";
    } else {
      try {
        const payment = paymentStatusSchema.parse(
          await mpFetch(`/v1/payments/${checkout.paymentId}`, {
            token: connection.token,
          }),
        );

        if (payment.status === "approved") {
          await processPayment(storeId, checkout.paymentId);
          return "paid";
        }
        if (payment.status === "in_process") return "in_process";
        if (payment.status === "pending") {
          // Pix gerado e não pago: cancela lá antes, para não ser pago depois.
          await mpFetch(`/v1/payments/${checkout.paymentId}`, {
            token: connection.token,
            method: "PUT",
            body: { status: "cancelled" },
          });
        }
      } catch (error) {
        if (error instanceof MpApiError) return "mp_unavailable";
        throw error;
      }
    }
  }

  // Melhor esforço: fecha o link do checkout para não aceitar mais pagamento.
  // Se falhar, o webhook ainda sinaliza qualquer pagamento tardio.
  if (connection && checkout?.preferenceId) {
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

  if (await cancelPendingOrder(orderId, storeId, "cancelled")) {
    return "cancelled";
  }

  // Não estava mais pendente: o webhook pode ter cancelado primeiro (o cancelamento
  // do Pix dispara um webhook) ou o pagamento ter sido aprovado nesse meio tempo.
  const current = await db.query.orderTable.findFirst({
    where: eq(orderTable.id, orderId),
  });
  return current?.status === "cancelled" ? "cancelled" : "paid";
}

const MAX_ORDERS = 100;
const CHUNK = 5;

export type CancelAllSummary = {
  cancelled: number;
  paid: number;
  /** Não foi possível cancelar agora (em análise, Mercado Pago fora, excesso). */
  blocked: number;
};

/**
 * Cancela todos os pedidos pendentes com checkout do Mercado Pago da loja.
 * Deve rodar ANTES de desconectar ou trocar a conta, enquanto o token ainda
 * permite cancelar os Pix gerados. Sem token utilizável, cancela só localmente.
 */
export async function cancelAllPendingOrders(
  storeId: string,
): Promise<CancelAllSummary> {
  const rows = await db
    .select({ orderId: orderTable.id })
    .from(orderTable)
    .innerJoin(mpCheckoutTable, eq(mpCheckoutTable.orderId, orderTable.id))
    .where(and(eq(orderTable.storeId, storeId), eq(orderTable.status, "pending")))
    .limit(MAX_ORDERS + 1);

  const summary: CancelAllSummary = {
    cancelled: 0,
    paid: 0,
    blocked: rows.length > MAX_ORDERS ? 1 : 0,
  };
  const batch = rows.slice(0, MAX_ORDERS);
  if (!batch.length) return summary;

  const connection = await connectionToken(storeId).catch(() => null);

  for (let i = 0; i < batch.length; i += CHUNK) {
    const results = await Promise.allSettled(
      batch.slice(i, i + CHUNK).map((row) =>
        cancelOrderWithPayment(row.orderId, storeId, {
          connection,
          allowLocal: true,
        }),
      ),
    );
    for (const result of results) {
      if (result.status === "rejected") summary.blocked += 1;
      else if (result.value === "cancelled") summary.cancelled += 1;
      else if (result.value === "paid") summary.paid += 1;
      else summary.blocked += 1;
    }
  }

  return summary;
}
