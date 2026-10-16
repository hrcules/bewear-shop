import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  notificationTable,
  orderItemTable,
  orderTable,
  storeTable,
  user,
} from "@/db/schema";
import { formatCentsToBRL } from "@/helpers/money";
import { storeOrigin } from "./config";
import {
  cancelScheduledEmail,
  sendCustomerPixPendingEmail,
  sendCustomerReceiptEmail,
  sendCustomerRefundEmail,
  sendStoreOwnerPaymentAlertEmail,
  sendStoreOwnerReconnectEmail,
  sendStoreOwnerNotificationEmail,
} from "@/lib/email";

/** E-mails + notificação interna quando um pedido é pago. Nunca lança. */
export async function notifyOrderPaid(orderId: string) {
  try {
    const order = await db.query.orderTable.findFirst({
      where: eq(orderTable.id, orderId),
      with: { shippingAddress: true },
    });
    if (!order?.shippingAddress) return;

    const store = await db.query.storeTable.findFirst({
      where: eq(storeTable.id, order.storeId),
    });
    if (!store) return;

    const items = await db.query.orderItemTable.findMany({
      where: eq(orderItemTable.orderId, orderId),
      with: { productVariant: { with: { product: true } } },
    });

    const subtotalInCents = items.reduce(
      (acc, item) => acc + item.priceInCents * item.quantity,
      0,
    );
    const shippingInCents = order.totalPriceInCents - subtotalInCents;

    const formattedItems = items.map((item) => ({
      name: `${item.productVariant.product.name} (${item.productVariant.name})`,
      quantity: item.quantity,
      priceFormatted: formatCentsToBRL(item.priceInCents * item.quantity),
    }));
    const subtotal = formatCentsToBRL(subtotalInCents);
    const shipping = formatCentsToBRL(shippingInCents);
    const total = formatCentsToBRL(order.totalPriceInCents);

    await sendCustomerReceiptEmail(
      order.shippingAddress.email,
      order.shippingAddress.fullName,
      order.orderNumber,
      store.name,
      formattedItems,
      subtotal,
      shipping,
      total,
      store.enableOnlinePayments,
    );

    const owner = await db.query.user.findFirst({
      where: eq(user.id, store.ownerId),
    });
    if (owner?.email) {
      await sendStoreOwnerNotificationEmail(
        owner.email,
        order.orderNumber,
        store.name,
        formattedItems,
        subtotal,
        shipping,
        total,
        store.enableOnlinePayments,
      );
      await db.insert(notificationTable).values({
        userId: owner.id,
        title: "💰 Nova Venda Realizada!",
        message: `O pedido #${order.orderNumber} no valor de ${total} acabou de ser pago via Mercado Pago.`,
        type: "sale",
      });
    }
  } catch (error) {
    console.error("Mercado Pago: falha ao notificar pedido pago", {
      orderId,
      message: error instanceof Error ? error.message : "erro desconhecido",
    });
  }
}

export type PaymentAlert =
  | { kind: "refunded" }
  | { kind: "charged_back" }
  | { kind: "partial_refund"; amountInCents: number }
  | { kind: "dispute" }
  | { kind: "review"; reason: string };

/** Avisa o lojista (notificação + e-mail) de reembolso, chargeback ou disputa. Nunca lança. */
export async function notifyPaymentAlert(orderId: string, alert: PaymentAlert) {
  try {
    const order = await db.query.orderTable.findFirst({
      where: eq(orderTable.id, orderId),
      with: { shippingAddress: true },
    });
    if (!order) return;

    const store = await db.query.storeTable.findFirst({
      where: eq(storeTable.id, order.storeId),
    });
    if (!store) return;

    const owner = await db.query.user.findFirst({
      where: eq(user.id, store.ownerId),
    });
    if (!owner) return;

    const ref = `#${order.orderNumber} (${formatCentsToBRL(order.totalPriceInCents)})`;
    let title: string;
    let message: string;

    switch (alert.kind) {
      case "refunded":
        title = "↩️ Pedido reembolsado";
        message = `O pedido ${ref} foi reembolsado no Mercado Pago. O status virou "Reembolsado" e o estoque foi devolvido automaticamente.`;
        break;
      case "charged_back":
        title = "⚠️ Chargeback no pedido";
        message = `O comprador contestou o pagamento do pedido ${ref} com o banco ou cartão (chargeback) e o valor foi estornado. O estoque foi devolvido. Verifique no painel do Mercado Pago se é possível contestar.`;
        break;
      case "partial_refund":
        title = "↩️ Reembolso parcial";
        message = `O pedido ${ref} recebeu um reembolso parcial de ${formatCentsToBRL(alert.amountInCents)} no Mercado Pago. O status do pedido e o estoque não foram alterados.`;
        break;
      case "review":
        title = "🔎 Pagamento precisa de revisão";
        message = `O pagamento do pedido ${ref} não foi confirmado automaticamente: ${alert.reason} Confira o pagamento no painel do Mercado Pago antes de enviar o pedido.`;
        break;
      case "dispute":
        title = "⚠️ Disputa aberta no pagamento";
        message = `Foi aberta uma disputa (mediação) no pagamento do pedido ${ref}. Acompanhe e responda no painel do Mercado Pago.`;
        break;
    }

    // Não repete o mesmo aviso se a notificação do Mercado Pago chegar de novo.
    const [existing] = await db
      .select({ id: notificationTable.id })
      .from(notificationTable)
      .where(
        and(
          eq(notificationTable.userId, owner.id),
          eq(notificationTable.message, message),
        ),
      )
      .limit(1);
    if (existing) return;

    await db.insert(notificationTable).values({
      userId: owner.id,
      title,
      message,
      type: "payment_alert",
    });

    if (owner.email) {
      await sendStoreOwnerPaymentAlertEmail(
        owner.email,
        `${title} — Pedido #${order.orderNumber}`,
        title,
        message,
      );
    }

    // O cliente só é avisado quando o dinheiro dele volta.
    const refundKinds = ["refunded", "charged_back", "partial_refund"];
    if (refundKinds.includes(alert.kind) && order.shippingAddress?.email) {
      await sendCustomerRefundEmail(
        order.shippingAddress.email,
        order.shippingAddress.fullName,
        order.orderNumber,
        store.name,
        formatCentsToBRL(
          alert.kind === "partial_refund"
            ? alert.amountInCents
            : order.totalPriceInCents,
        ),
        alert.kind === "partial_refund",
      );
    }
  } catch (error) {
    console.error("Mercado Pago: falha ao avisar lojista de pagamento", {
      orderId,
      kind: alert.kind,
      message: error instanceof Error ? error.message : "erro desconhecido",
    });
  }
}

/** Avisa o lojista que a conexão com o Mercado Pago precisa ser refeita. Nunca lança. */
export async function notifyReconnectNeeded(storeId: string) {
  try {
    const store = await db.query.storeTable.findFirst({
      where: eq(storeTable.id, storeId),
    });
    if (!store) return;

    const owner = await db.query.user.findFirst({
      where: eq(user.id, store.ownerId),
    });
    if (!owner) return;

    await db.insert(notificationTable).values({
      userId: owner.id,
      title: "⚠️ Reconecte o Mercado Pago",
      message:
        "A conexão da sua loja com o Mercado Pago expirou ou foi revogada. Enquanto não for refeita, seus clientes não conseguem pagar online. Reconecte em Configurações.",
      type: "payment_alert",
    });

    if (owner.email) {
      await sendStoreOwnerReconnectEmail(
        owner.email,
        store.name,
        `${storeOrigin(store.slug)}/admin/settings`,
      );
    }
  } catch (error) {
    console.error("Mercado Pago: falha ao avisar reconexão", {
      storeId,
      message: error instanceof Error ? error.message : "erro desconhecido",
    });
  }
}

const HOUR = 60 * 60 * 1000;
// Brasil sem horário de verão: horário local = UTC-3.
const localDate = (date: Date) => new Date(date.getTime() - 3 * HOUR);

/**
 * Horário do lembrete: ~4h antes de o Pix expirar, mas sem acordar o cliente
 * (fora de 8h-21h vai para 20h). Retorna null se já passou ou está longe
 * demais (o Brevo agenda no máximo 72h à frente).
 */
export function pixReminderTime(expiresAt: Date, now = new Date()) {
  let at = new Date(expiresAt.getTime() - 4 * HOUR);
  const local = localDate(at);
  const hour = local.getUTCHours();
  if (hour >= 21 || hour < 8) {
    local.setUTCHours(20, 0, 0, 0);
    if (hour < 8) local.setUTCDate(local.getUTCDate() - 1);
    at = new Date(local.getTime() + 3 * HOUR);
  }
  if (at.getTime() < now.getTime() + 30 * 60 * 1000) return null;
  if (at.getTime() > now.getTime() + 71 * HOUR) return null;
  return at;
}

export type PendingPixNotice = {
  expiresAt: Date | null;
  pixCode: string | null;
};

/** Avisa o cliente que o Pix aguarda pagamento e agenda o lembrete. Nunca lança. */
export async function notifyPixPending(orderId: string, notice: PendingPixNotice) {
  try {
    const order = await db.query.orderTable.findFirst({
      where: eq(orderTable.id, orderId),
      with: { shippingAddress: true },
    });
    if (!order?.shippingAddress?.email) return;

    const store = await db.query.storeTable.findFirst({
      where: eq(storeTable.id, order.storeId),
    });
    if (!store) return;

    const base = {
      customerEmail: order.shippingAddress.email,
      customerName: order.shippingAddress.fullName,
      orderNumber: order.orderNumber,
      storeName: store.name,
      amountFormatted: formatCentsToBRL(order.totalPriceInCents),
      expiresLabel: notice.expiresAt
        ? new Intl.DateTimeFormat("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
            .format(notice.expiresAt)
            .replace(",", " às")
        : null,
      pixCode: notice.pixCode,
      ordersUrl: `${storeOrigin(store.slug)}/orders`,
    };

    await sendCustomerPixPendingEmail({ ...base, reminder: false });

    const at = notice.expiresAt ? pixReminderTime(notice.expiresAt) : null;
    if (!at) {
      console.info("Mercado Pago: lembrete de Pix não agendado", {
        orderId,
        expiresAt: notice.expiresAt?.toISOString() ?? null,
      });
    }
    if (at) {
      await sendCustomerPixPendingEmail({
        ...base,
        reminder: true,
        // O ID do pedido (UUID) identifica o envio para podermos cancelá-lo.
        schedule: { at, batchId: orderId },
      });
    }
  } catch (error) {
    console.error("Mercado Pago: falha ao avisar Pix pendente", {
      orderId,
      message: error instanceof Error ? error.message : "erro desconhecido",
    });
  }
}

/** Cancela o lembrete agendado (pedido pago, cancelado ou reembolsado). Nunca lança. */
export async function cancelPixReminder(orderId: string) {
  await cancelScheduledEmail(orderId);
}
