import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  mpCheckoutTable,
  orderItemTable,
  orderTable,
  productVariantTable,
} from "@/db/schema";

import { storePaymentLock } from "./connection";
import { cancelPixReminder } from "./notify";

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
