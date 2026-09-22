import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { mpCheckoutTable, orderTable } from "@/db/schema";
import { deliverPaymentEmails } from "@/lib/mercadopago/emails";
import { reconcileCheckout } from "@/lib/mercadopago/reconciliation";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const expected = `Bearer ${process.env.MP_RECONCILE_SECRET ?? ""}`;
  const actual = request.headers.get("authorization") ?? "";
  if (
    !process.env.MP_RECONCILE_SECRET ||
    actual.length !== expected.length ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    return new Response(null, { status: 401 });
  const pending = await db
    .select({
      id: mpCheckoutTable.orderId,
      storeId: mpCheckoutTable.storeId,
      expiresAt: mpCheckoutTable.expiresAt,
    })
    .from(mpCheckoutTable)
    .innerJoin(orderTable, eq(orderTable.id, mpCheckoutTable.orderId))
    .where(
      and(
        eq(orderTable.status, "pending"),
        lt(mpCheckoutTable.updatedAt, new Date(Date.now() - 60000)),
      ),
    )
    .orderBy(asc(mpCheckoutTable.updatedAt))
    .limit(1);
  for (const checkout of pending) {
    try {
      await reconcileCheckout(checkout.id, checkout.storeId);
      const order = await db.query.orderTable.findFirst({
        where: eq(orderTable.id, checkout.id),
      });
      if (order?.status === "pending" && checkout.expiresAt < new Date())
        await db
          .update(mpCheckoutTable)
          .set({
            reviewReason: "expired_requires_reconciliation",
            updatedAt: new Date(),
          })
          .where(eq(mpCheckoutTable.orderId, checkout.id));
    } catch {
      console.error("Mercado Pago: reconciliation failed", {
        orderId: checkout.id,
      });
    }
  }
  await deliverPaymentEmails();
  return Response.json({ processed: pending.length });
}
