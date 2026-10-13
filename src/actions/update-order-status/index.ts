"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { orderTable, orderItemTable, productVariantTable } from "@/db/schema";
import { tenantOwnerAction } from "@/lib/safe-action";

export const updateOrderStatusAction = tenantOwnerAction<
  { orderId: string; newStatus: string },
  { success: boolean }
>(async ({ orderId, newStatus }, ctx) => {
  const { storeId } = ctx;

  const order = await db.query.orderTable.findFirst({
    where: eq(orderTable.id, orderId),
  });

  if (!order || order.storeId !== storeId) {
    throw new Error("Pedido não encontrado ou não pertence à sua loja.");
  }

  if (order.status === "cancelled" && newStatus !== "cancelled") {
    throw new Error(
      "Não é possível alterar o status de um pedido já cancelado.",
    );
  }

  if (newStatus === "cancelled" && order.status !== "cancelled") {
    const orderItems = await db.query.orderItemTable.findMany({
      where: eq(orderItemTable.orderId, orderId),
    });

    for (const item of orderItems) {
      await db
        .update(productVariantTable)
        .set({
          stock: sql`${productVariantTable.stock} + ${item.quantity}`,
        })
        .where(eq(productVariantTable.id, item.productVariantId));
    }
  }

  await db
    .update(orderTable)
    .set({ status: newStatus })
    .where(eq(orderTable.id, orderId));

  revalidatePath("/admin/orders");
  revalidatePath("/orders");

  return { success: true };
});
