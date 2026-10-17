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
import {
  cancelPixReminder,
  notifyOrderPaid,
  notifyPaymentAlert,
  notifyPixPending,
  type PaymentAlert,
  type PendingPixNotice,
} from "./notify";

const paymentSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  status: z.string(),
  external_reference: z.string().nullable().optional(),
  transaction_amount: z.number(),
  currency_id: z.string().optional(),
  collector_id: z.union([z.number(), z.string()]).nullish(),
  transaction_amount_refunded: z.number().nullish(),
  payment_method_id: z.string().optional(),
  payment_type_id: z.string().optional(),
  installments: z.number().nullish(),
  date_approved: z.string().nullish(),
  date_of_expiration: z.string().nullish(),
  point_of_interaction: z
    .object({
      transaction_data: z
        .object({ qr_code: z.string().nullish() })
        .nullish(),
    })
    .nullish(),
});

// Pedidos que já foram pagos e ainda não foram revertidos.
const PAID_STATUSES = ["paid", "processing", "shipped", "delivered"];

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
  let alert = null as PaymentAlert | null;
  let pixNotice = null as PendingPixNotice | null;
  let settled = false; // pedido saiu de "pendente": o lembrete não faz mais sentido

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

    // Meio de pagamento, parcelas e data: o que o lojista vê no painel.
    const paymentDetails = () => ({
      paymentMethodId: payment.payment_method_id ?? null,
      paymentTypeId: payment.payment_type_id ?? null,
      installments: payment.installments ?? null,
      paidAt: payment.date_approved ? new Date(payment.date_approved) : new Date(),
    });

    const record = (
      status: string,
      reviewReason: string | null = null,
      extra: Partial<typeof mpCheckoutTable.$inferInsert> = {},
    ) =>
      tx
        .update(mpCheckoutTable)
        .set({
          ...extra,
          status,
          paymentId: payment.id,
          lastPaymentStatus: payment.status,
          reviewReason,
          updatedAt: new Date(),
        })
        .where(eq(mpCheckoutTable.orderId, orderId));

    const flagReview = async (reason: string) => {
      const first = checkout.status !== "review";
      await record("review", reason);
      if (first) alert = { kind: "review", reason };
    };

    const restoreStock = async () => {
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
    };

    // Reembolso total ou chargeback: o dinheiro voltou ao comprador.
    if (payment.status === "refunded" || payment.status === "charged_back") {
      if (checkout.status === payment.status) return; // já tratado

      const kind = payment.status;
      if (order.status === "pending") {
        // Pagamento revertido antes de o pedido ser marcado como pago.
        settled = true;
        await tx
          .update(orderTable)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(orderTable.id, orderId));
        await restoreStock();
      } else if (PAID_STATUSES.includes(order.status)) {
        await tx
          .update(orderTable)
          .set({ status: "refunded", updatedAt: new Date() })
          .where(eq(orderTable.id, orderId));
        await restoreStock();
        alert = { kind };
      } else if (kind === "charged_back") {
        alert = { kind }; // pedido já cancelado/reembolsado, mas vale avisar
      }
      await record(kind);
      return;
    }

    // Já aprovado antes: notificações atrasadas/fora de ordem não mudam o
    // pedido, mas avisamos o lojista de disputa e de reembolso parcial.
    if (checkout.status === "approved") {
      // Pedidos aprovados antes de guardarmos esses dados: completa quando
      // o Mercado Pago voltar a notificar.
      if (payment.status === "approved" && !checkout.paymentMethodId) {
        await tx
          .update(mpCheckoutTable)
          .set(paymentDetails())
          .where(eq(mpCheckoutTable.orderId, orderId));
      }
      if (
        payment.status === "in_mediation" &&
        checkout.lastPaymentStatus !== "in_mediation"
      ) {
        await record("approved");
        alert = { kind: "dispute" };
      } else if (payment.status === "approved") {
        const refundedInCents = Math.round(
          (payment.transaction_amount_refunded ?? 0) * 100,
        );
        if (refundedInCents > 0) {
          alert = { kind: "partial_refund", amountInCents: refundedInCents };
        }
      }
      return;
    }

    if (payment.status === "approved") {
      const amountOk =
        Math.round(payment.transaction_amount * 100) ===
        order.totalPriceInCents;
      const currencyOk = !payment.currency_id || payment.currency_id === "BRL";
      const collectorOk =
        payment.collector_id == null ||
        String(payment.collector_id) === checkout.sellerId;

      if (!amountOk || !currencyOk || !collectorOk) {
        await flagReview("Pagamento não confere com o pedido.");
        return;
      }
      if (order.status === "cancelled") {
        await flagReview("O pagamento foi aprovado depois de o pedido ser cancelado.");
        return;
      }
      if (order.status === "refunded") {
        await flagReview("O pagamento foi aprovado depois de o pedido ser reembolsado.");
        return;
      }

      if (order.status === "pending") {
        await tx
          .update(orderTable)
          .set({ status: "paid", updatedAt: new Date() })
          .where(eq(orderTable.id, orderId));
        paidNow = true;
        settled = true;
      }
      await record("approved", null, paymentDetails());
      return;
    }

    if (payment.status === "cancelled" && order.status === "pending") {
      settled = true;
      await tx
        .update(orderTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(orderTable.id, orderId));

      await restoreStock();
      await record("cancelled");
      return;
    }

    // Pix recém-gerado: avisa o cliente (uma vez) e agenda o lembrete.
    if (
      payment.status === "pending" &&
      payment.payment_method_id === "pix" &&
      order.status === "pending" &&
      checkout.lastPaymentStatus !== "pending"
    ) {
      pixNotice = {
        expiresAt: payment.date_of_expiration
          ? new Date(payment.date_of_expiration)
          : null,
        pixCode:
          payment.point_of_interaction?.transaction_data?.qr_code ?? null,
      };
    }

    // rejected/pending/in_process etc.: o comprador pode tentar de novo na
    // mesma preferência, então só registramos o último estado.
    await record(checkout.status, checkout.reviewReason);
  });

  if (settled) await cancelPixReminder(orderId);
  if (pixNotice) await notifyPixPending(orderId, pixNotice);
  if (paidNow) await notifyOrderPaid(orderId);
  if (alert) await notifyPaymentAlert(orderId, alert);
}
