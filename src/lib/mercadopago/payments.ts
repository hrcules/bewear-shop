import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  mpCheckoutTable,
  orderItemTable,
  orderTable,
  productVariantTable,
} from "@/db/schema";

import { mpFetch } from "./api";
import { connectionToken, storePaymentLock } from "./connection";
import { notifyOrderPaid } from "./notify";

const paymentSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  status: z.string(),
  external_reference: z.string().nullable().optional(),
  transaction_amount: z.number(),
  currency_id: z.string().optional(),
  collector_id: z.union([z.number(), z.string()]).nullish(),
});

/**
 * Consulta o pagamento direto na API do Mercado Pago (com o token do lojista)
 * e atualiza pedido/estoque. É idempotente: pode rodar várias vezes.
 * A notificação em si nunca é confiada — só serve de gatilho.
 */
export async function processPayment(storeId: string, paymentId: string) {
  const connection = await connectionToken(storeId);

  const payment = paymentSchema.parse(
    await mpFetch(`/v1/payments/${paymentId}`, { token: connection.token }),
  );

  const orderId = payment.external_reference;
  if (!orderId || !z.string().uuid().safeParse(orderId).success) return;

  let paidNow = false;

  await db.transaction(async (tx) => {
    await tx.execute(storePaymentLock(storeId));

    const [checkout] = await tx
      .select()
      .from(mpCheckoutTable)
      .where(
        and(
          eq(mpCheckoutTable.orderId, orderId),
          eq(mpCheckoutTable.storeId, storeId),
        ),
      )
      .for("update");
    if (!checkout) return; // pedido de outro fluxo/loja: ignora

    const [order] = await tx
      .select()
      .from(orderTable)
      .where(eq(orderTable.id, orderId))
      .for("update");
    if (!order || order.storeId !== storeId) return;

    // Já aprovado antes: notificações atrasadas/fora de ordem não mudam nada.
    if (checkout.status === "approved") return;

    const record = (status: string, reviewReason: string | null = null) =>
      tx
        .update(mpCheckoutTable)
        .set({
          status,
          paymentId: payment.id,
          lastPaymentStatus: payment.status,
          reviewReason,
          updatedAt: new Date(),
        })
        .where(eq(mpCheckoutTable.orderId, orderId));

    if (payment.status === "approved") {
      const amountOk =
        Math.round(payment.transaction_amount * 100) ===
        order.totalPriceInCents;
      const currencyOk = !payment.currency_id || payment.currency_id === "BRL";
      const collectorOk =
        payment.collector_id == null ||
        String(payment.collector_id) === checkout.sellerId;

      if (!amountOk || !currencyOk || !collectorOk) {
        await record("review", "Pagamento não confere com o pedido.");
        return;
      }
      if (order.status === "cancelled") {
        await record("review", "Pagamento aprovado após cancelamento.");
        return;
      }

      if (order.status === "pending") {
        await tx
          .update(orderTable)
          .set({ status: "paid", updatedAt: new Date() })
          .where(eq(orderTable.id, orderId));
        paidNow = true;
      }
      await record("approved");
      return;
    }

    if (payment.status === "cancelled" && order.status === "pending") {
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
      await record("cancelled");
      return;
    }

    // rejected/pending/in_process etc.: o comprador pode tentar de novo na
    // mesma preferência, então só registramos o último estado.
    await record(checkout.status, checkout.reviewReason);
  });

  if (paidNow) await notifyOrderPaid(orderId);
}
