"use server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orderTable } from "@/db/schema";
import { authenticatedAction } from "@/lib/safe-action";
import { reserveCheckout, preferenceUrl } from "@/lib/mercadopago/checkout";
import { mpCheckoutSchema } from "./schema";
export const startMercadoPagoCheckout = authenticatedAction<
  unknown,
  { orderId: string; checkoutUrl: string }
>(async (input, ctx) => {
  const parsed = mpCheckoutSchema.parse(input);
  const orderId = await reserveCheckout(parsed, ctx);
  const order = await db.query.orderTable.findFirst({
    where: eq(orderTable.id, orderId),
  });
  if (order && order.status !== "pending")
    return { orderId, checkoutUrl: `/checkout/mercadopago?orderId=${orderId}` };
  return { orderId, checkoutUrl: await preferenceUrl(orderId, ctx) };
});
