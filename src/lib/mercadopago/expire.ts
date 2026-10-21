import { and, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { mpCheckoutTable, orderTable, storeTable } from "@/db/schema";

import { mpFetch } from "./api";
import { cancelPendingOrder } from "./cancel";
import { connectionToken } from "./connection";
import { processPayment } from "./payments";

// Folga depois que a preferência expira (Pix gerado no fim do prazo ainda vale).
const GRACE_MS = 60 * 60 * 1000;
// Pedido de loja online que nunca chegou a criar a preferência.
const ORPHAN_AFTER_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;

const paymentSchema = z.object({
  status: z.string(),
  date_of_expiration: z.string().nullish(),
});

/** Cancela o pedido (se ainda pendente) e devolve o estoque. */
const cancelPending = (orderId: string, storeId: string) =>
  cancelPendingOrder(orderId, storeId, "expired");

export type ExpireSummary = {
  expired: number;
  paid: number;
  waiting: number;
  errors: number;
};

/**
 * Cancela pedidos do Mercado Pago que ficaram pendentes depois do prazo e
 * devolve o estoque. Antes de cancelar, confere o pagamento no Mercado Pago:
 * se foi pago, confirma o pedido; se há Pix ainda válido, espera.
 * Idempotente: pode rodar quantas vezes for preciso.
 */
export async function expireStaleOrders(): Promise<ExpireSummary> {
  const summary: ExpireSummary = { expired: 0, paid: 0, waiting: 0, errors: 0 };

  // 1) Pedidos com preferência vencida.
  const withCheckout = await db
    .select({
      orderId: mpCheckoutTable.orderId,
      storeId: mpCheckoutTable.storeId,
      paymentId: mpCheckoutTable.paymentId,
      lastPaymentStatus: mpCheckoutTable.lastPaymentStatus,
    })
    .from(mpCheckoutTable)
    .innerJoin(orderTable, eq(orderTable.id, mpCheckoutTable.orderId))
    .where(
      and(
        eq(orderTable.status, "pending"),
        lt(mpCheckoutTable.expiresAt, new Date(Date.now() - GRACE_MS)),
      ),
    )
    .limit(BATCH);

  for (const row of withCheckout) {
    try {
      if (
        row.paymentId &&
        ["pending", "in_process"].includes(row.lastPaymentStatus ?? "")
      ) {
        const connection = await connectionToken(row.storeId);
        const payment = paymentSchema.parse(
          await mpFetch(`/v1/payments/${row.paymentId}`, {
            token: connection.token,
          }),
        );

        if (payment.status === "approved") {
          await processPayment(row.storeId, row.paymentId);
          summary.paid += 1;
          continue;
        }

        const stillValid =
          ["pending", "in_process"].includes(payment.status) &&
          (!payment.date_of_expiration ||
            new Date(payment.date_of_expiration).getTime() > Date.now());
        if (stillValid) {
          summary.waiting += 1;
          continue;
        }
      }

      if (await cancelPending(row.orderId, row.storeId)) summary.expired += 1;
    } catch (error) {
      summary.errors += 1;
      console.error("Mercado Pago: falha ao expirar pedido", {
        orderId: row.orderId,
        message: error instanceof Error ? error.message : "erro desconhecido",
      });
    }
  }

  // 2) Pedidos de lojas com Mercado Pago que nunca criaram a preferência
  //    (cliente fechou a página antes). Lojas em modo catálogo ficam de fora.
  const orphans = await db
    .select({ orderId: orderTable.id, storeId: orderTable.storeId })
    .from(orderTable)
    .innerJoin(storeTable, eq(storeTable.id, orderTable.storeId))
    .leftJoin(mpCheckoutTable, eq(mpCheckoutTable.orderId, orderTable.id))
    .where(
      and(
        eq(orderTable.status, "pending"),
        eq(orderTable.paymentProvider, "legacy"),
        eq(storeTable.checkoutProvider, "mercadopago"),
        eq(storeTable.enableOnlinePayments, true),
        isNull(mpCheckoutTable.orderId),
        lt(orderTable.createdAt, new Date(Date.now() - ORPHAN_AFTER_MS)),
      ),
    )
    .limit(BATCH);

  for (const row of orphans) {
    try {
      if (await cancelPending(row.orderId, row.storeId)) summary.expired += 1;
    } catch (error) {
      summary.errors += 1;
      console.error("Mercado Pago: falha ao expirar pedido sem preferência", {
        orderId: row.orderId,
        message: error instanceof Error ? error.message : "erro desconhecido",
      });
    }
  }

  return summary;
}
