"use server";
import { revalidatePath } from "next/cache";
import { tenantOwnerAction } from "@/lib/safe-action";
import {
  cancelUnpaidCheckout,
  reconcileCheckout,
} from "@/lib/mercadopago/reconciliation";
import { deliverPaymentEmails } from "@/lib/mercadopago/emails";
import { reconcileSchema } from "./schema";
export const reconcileMercadoPago = tenantOwnerAction<
  unknown,
  { success: boolean }
>(async (input, ctx) => {
  const data = reconcileSchema.parse(input);
  if (data.cancel) await cancelUnpaidCheckout(data.orderId, ctx.storeId);
  else await reconcileCheckout(data.orderId, ctx.storeId);
  await deliverPaymentEmails();
  revalidatePath("/admin/settings");
  revalidatePath("/admin/orders");
  return { success: true };
});
