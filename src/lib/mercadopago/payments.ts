import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  mpCheckoutTable,
  mpEmailTable,
  notificationTable,
  orderTable,
  storeTable,
} from "@/db/schema";
import { mpFetch, paymentSchema, type MpPayment } from "./api";
import { connectionToken } from "./connection";

export function matchesPayment(
  payment: MpPayment,
  checkout: { orderId: string; sellerId: string; liveMode: boolean },
  total: number,
) {
  return (
    payment.external_reference === checkout.orderId &&
    payment.collector_id === checkout.sellerId &&
    payment.live_mode === checkout.liveMode &&
    payment.currency_id === "BRL" &&
    Math.round(payment.transaction_amount * 100) === total
  );
}
export async function processPayment(storeId: string, paymentId: string) {
  const connection = await connectionToken(storeId, true);
  const initial = paymentSchema.parse(
    await mpFetch(
      `/v1/payments/${encodeURIComponent(paymentId)}`,
      connection.token,
    ),
  );
  if (!z.string().uuid().safeParse(initial.external_reference).success) return;
  await db.transaction(async (tx) => {
    const [checkout] = await tx
      .select()
      .from(mpCheckoutTable)
      .where(
        and(
          eq(mpCheckoutTable.orderId, initial.external_reference),
          eq(mpCheckoutTable.storeId, storeId),
        ),
      )
      .for("update");
    if (!checkout) return; // Never mutate legacy orders through this endpoint.
    const [order] = await tx
      .select()
      .from(orderTable)
      .where(
        and(
          eq(orderTable.id, checkout.orderId),
          eq(orderTable.storeId, storeId),
        ),
      )
      .for("update");
    if (!order) throw new Error("Pedido ausente.");
    // Fetch under the lock: repeated/delayed deliveries use the current gateway state.
    const payment = paymentSchema.parse(
      await mpFetch(
        `/v1/payments/${encodeURIComponent(paymentId)}`,
        connection.token,
      ),
    );
    if (!matchesPayment(payment, checkout, order.totalPriceInCents))
      throw new Error("Pagamento incompatível.");
    const status = payment.status;
    let reviewReason = checkout.reviewReason;
    if (status === "approved") {
      if (checkout.paymentId && checkout.paymentId !== payment.id) {
        reviewReason = "multiple_approved_payments";
      } else if (order.status === "pending") {
        reviewReason = null;
        await tx
          .update(orderTable)
          .set({ status: "paid", updatedAt: new Date() })
          .where(eq(orderTable.id, order.id));
        const store = await tx.query.storeTable.findFirst({
          where: eq(storeTable.id, storeId),
        });
        if (!store) throw new Error("Loja ausente.");
        await tx.insert(notificationTable).values({
          userId: store.ownerId,
          title: "Pagamento aprovado",
          message: `Pedido #${order.orderNumber} pago pelo Mercado Pago.`,
          type: "sale",
        });
        await tx
          .insert(mpEmailTable)
          .values([
            { orderId: order.id, recipient: "customer" },
            { orderId: order.id, recipient: "owner" },
          ])
          .onConflictDoNothing();
      } else if (["cancelled", "canceled", "refunded"].includes(order.status)) {
        reviewReason = "late_payment_after_release";
      }
      if (!checkout.paymentId)
        await tx
          .update(mpCheckoutTable)
          .set({ paymentId: payment.id })
          .where(eq(mpCheckoutTable.orderId, order.id));
    }
    if (
      ["refunded", "charged_back"].includes(status) &&
      (!checkout.paymentId || checkout.paymentId === payment.id)
    ) {
      reviewReason = status;
      // No automatic stock return: the goods may already have been shipped.
      if (checkout.reviewReason !== status) {
        const store = await tx.query.storeTable.findFirst({
          where: eq(storeTable.id, storeId),
        });
        if (store)
          await tx.insert(notificationTable).values({
            userId: store.ownerId,
            title: "Pagamento precisa de revisão",
            message: `Revise o pedido #${order.orderNumber} no Mercado Pago (${status}).`,
            type: "payment_review",
          });
      }
    }
    // A rejected attempt does not cancel the preference: the buyer can try again.
    await tx
      .update(mpCheckoutTable)
      .set({ lastPaymentStatus: status, reviewReason, updatedAt: new Date() })
      .where(eq(mpCheckoutTable.orderId, order.id));
  });
}
