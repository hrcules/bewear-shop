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
import { mpFetch } from "./api";
import { connectionToken } from "./connection";

const orderSchema = z.object({
  id: z.string().min(1),
  user_id: z.union([z.string(), z.number()]).transform(String),
  external_reference: z.string(),
  total_amount: z.union([z.string(), z.number()]).transform(String),
  currency: z.string(),
  status: z.string(),
  live_mode: z.boolean().optional(),
  transactions: z
    .object({
      payments: z
        .array(
          z.object({
            id: z.union([z.string(), z.number()]).transform(String),
            status: z.string(),
            status_detail: z.string().optional(),
            amount: z
              .union([z.string(), z.number()])
              .transform(String)
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export async function processOrder(storeId: string, mercadoPagoOrderId: string) {
  const connection = await connectionToken(storeId, true);
  const mpOrder = orderSchema.parse(
    await mpFetch(
      `/v1/orders/${encodeURIComponent(mercadoPagoOrderId)}`,
      connection.token,
    ),
  );

  if (!z.string().uuid().safeParse(mpOrder.external_reference).success) return;

  await db.transaction(async (tx) => {
    const [checkout] = await tx
      .select()
      .from(mpCheckoutTable)
      .where(
        and(
          eq(mpCheckoutTable.mercadoPagoOrderId, mpOrder.id),
          eq(mpCheckoutTable.storeId, storeId),
        ),
      )
      .for("update");

    if (!checkout) return;

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

    const total = Number(mpOrder.total_amount);
    if (
      !Number.isFinite(total) ||
      Math.round(total * 100) !== order.totalPriceInCents ||
      mpOrder.external_reference !== order.id ||
      mpOrder.user_id !== checkout.sellerId ||
      mpOrder.currency !== "BRL" ||
      (mpOrder.live_mode !== undefined &&
        mpOrder.live_mode !== checkout.liveMode)
    )
      throw new Error("Order do Mercado Pago incompatível.");

    const payments = mpOrder.transactions?.payments ?? [];
    const approvedPayment = payments.find(
      (payment) => payment.status === "approved",
    );
    const payment = approvedPayment ?? payments[0];
    const paymentStatus = payment?.status ?? mpOrder.status;
    let reviewReason = checkout.reviewReason;

    if (mpOrder.status === "processed" || approvedPayment) {
      if (checkout.paymentId && payment?.id && checkout.paymentId !== payment.id) {
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

      if (!checkout.paymentId && payment?.id) {
        await tx
          .update(mpCheckoutTable)
          .set({ paymentId: payment.id })
          .where(eq(mpCheckoutTable.orderId, order.id));
      }
    }

    if (
      ["refunded", "charged_back"].includes(paymentStatus) &&
      (!checkout.paymentId || checkout.paymentId === payment?.id)
    ) {
      reviewReason = paymentStatus;
      if (checkout.reviewReason !== paymentStatus) {
        const store = await tx.query.storeTable.findFirst({
          where: eq(storeTable.id, storeId),
        });
        if (store)
          await tx.insert(notificationTable).values({
            userId: store.ownerId,
            title: "Pagamento precisa de revisão",
            message: `Revise o pedido #${order.orderNumber} no Mercado Pago (${paymentStatus}).`,
            type: "payment_review",
          });
      }
    }

    await tx
      .update(mpCheckoutTable)
      .set({
        lastPaymentStatus: paymentStatus,
        reviewReason,
        updatedAt: new Date(),
      })
      .where(eq(mpCheckoutTable.orderId, order.id));
  });
}
