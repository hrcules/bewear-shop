import { eq } from "drizzle-orm";

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
