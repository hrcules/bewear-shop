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
import {
  sendCustomerReceiptEmail,
  sendCustomerRefundEmail,
  sendCustomerRefundEmail,
  sendStoreOwnerPaymentAlertEmail,
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
  | { kind: "dispute" };

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
    if (alert.kind !== "dispute" && order.shippingAddress?.email) {
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
