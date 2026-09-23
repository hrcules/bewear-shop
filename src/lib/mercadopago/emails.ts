import { eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { mpEmailTable, orderTable, user } from "@/db/schema";
import {
  sendCustomerReceiptEmail,
  sendStoreOwnerNotificationEmail,
} from "@/lib/email";
import { formatCentsToBRL } from "@/helpers/money";
export async function deliverPaymentEmails() {
  const jobs = await db
    .select({ id: mpEmailTable.id })
    .from(mpEmailTable)
    .where(isNull(mpEmailTable.sentAt))
    .limit(2);
  for (const job of jobs) {
    try {
      await db.transaction(async (tx) => {
        const [email] = await tx
          .select()
          .from(mpEmailTable)
          .where(eq(mpEmailTable.id, job.id))
          .for("update", { skipLocked: true });
        if (!email || email.sentAt) return;
        const order = await tx.query.orderTable.findFirst({
          where: eq(orderTable.id, email.orderId),
          with: {
            store: true,
            shippingAddress: true,
            items: { with: { productVariant: { with: { product: true } } } },
          },
        });
        if (!order) throw new Error("Pedido ausente.");
        const owner = await tx.query.user.findFirst({
          where: eq(user.id, order.store.ownerId),
        });
        const items = order.items.map((item) => ({
          name: `${item.productVariant.product.name} (${item.productVariant.name})`,
          quantity: item.quantity,
          priceFormatted: formatCentsToBRL(item.priceInCents * item.quantity),
        }));
        const subtotal = order.items.reduce(
          (n, item) => n + item.priceInCents * item.quantity,
          0,
        );
        if (email.recipient === "customer") {
          await sendCustomerReceiptEmail(
            order.shippingAddress.email,
            order.shippingAddress.fullName,
            order.orderNumber,
            order.store.name,
            items,
            formatCentsToBRL(subtotal),
            formatCentsToBRL(order.totalPriceInCents - subtotal),
            formatCentsToBRL(order.totalPriceInCents),
            true,
            true,
          );
        } else {
          if (!owner) throw new Error("Lojista ausente.");
          await sendStoreOwnerNotificationEmail(
            owner.email,
            order.orderNumber,
            order.store.name,
            items,
            formatCentsToBRL(subtotal),
            formatCentsToBRL(order.totalPriceInCents - subtotal),
            formatCentsToBRL(order.totalPriceInCents),
            true,
            true,
          );
        }
        await tx
          .update(mpEmailTable)
          .set({ sentAt: new Date(), attempts: email.attempts + 1 })
          .where(eq(mpEmailTable.id, email.id));
      });
    } catch {
      console.error("Mercado Pago: email queued for retry", { jobId: job.id });
    }
  }
}
