"use server";

import { randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  mpConnectionTable,
  mpOAuthStateTable,
  mpCheckoutTable,
  orderTable,
  storeTable,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { tenantOwnerAction } from "@/lib/safe-action";
import { mpEnabled, oauthConfig, required } from "@/lib/mercadopago/config";
import {
  connectionToken,
  storePaymentLock,
} from "@/lib/mercadopago/connection";
import { encrypt, hash } from "@/lib/mercadopago/security";
import { connectionCommandSchema } from "./schema";

export const connectMercadoPago = tenantOwnerAction<void, { url: string }>(
  async (_, ctx) => {
    if (!mpEnabled())
      throw new Error("Conexão Mercado Pago ainda não disponível.");
    const config = oauthConfig();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) throw new Error("Faça login novamente.");
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    await db.transaction(async (tx) => {
      await tx
        .delete(mpOAuthStateTable)
        .where(
          and(
            eq(mpOAuthStateTable.storeId, ctx.storeId),
            eq(mpOAuthStateTable.userId, ctx.userId),
          ),
        );
      await tx.insert(mpOAuthStateTable).values({
        stateHash: hash(state),
        storeId: ctx.storeId,
        userId: ctx.userId,
        sessionHash: hash(session.session.id),
        verifierEncrypted: encrypt(verifier, ctx.storeId),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
    });
    const url = new URL("https://auth.mercadopago.com/authorization");
    url.search = new URLSearchParams({
      client_id: config.client_id,
      redirect_uri: config.redirect_uri,
      response_type: "code",
      platform_id: "mp",
      state,
      code_challenge: hash(verifier),
      code_challenge_method: "S256",
    }).toString();
    return { url: url.toString() };
  },
);

export const manageMercadoPago = tenantOwnerAction<
  unknown,
  { success: boolean }
>(async (input, ctx) => {
  const command = connectionCommandSchema.parse(input);
  if (command === "enable") {
    if (!mpEnabled()) throw new Error("Integração ainda não disponível.");
    required("MP_WEBHOOK_SECRET");
    await connectionToken(ctx.storeId);
  }
  await db.transaction(async (tx) => {
    await tx.execute(storePaymentLock(ctx.storeId));
    const [store] = await tx
      .select()
      .from(storeTable)
      .where(eq(storeTable.id, ctx.storeId))
      .for("update");
    if (!store || store.ownerId !== ctx.userId)
      throw new Error("Não autorizado.");
    if (command === "enable") {
      const [connection] = await tx
        .select()
        .from(mpConnectionTable)
        .where(eq(mpConnectionTable.storeId, ctx.storeId))
        .for("update");
      if (
        !connection ||
        connection.status !== "connected" ||
        connection.expiresAt <= new Date()
      )
        throw new Error("Reconecte sua conta.");
      if (store.pixDiscountPercent !== 0)
        throw new Error(
          "Zere o desconto exclusivo de Pix antes de ativar o Checkout Pro. O meio de pagamento será escolhido no Mercado Pago.",
        );
      await tx
        .update(storeTable)
        .set({ checkoutProvider: "mercadopago", updatedAt: new Date() })
        .where(eq(storeTable.id, ctx.storeId));
    } else if (command === "disable") {
      await tx
        .update(storeTable)
        .set({ checkoutProvider: "legacy", updatedAt: new Date() })
        .where(eq(storeTable.id, ctx.storeId));
    } else {
      const pending = await tx
        .select({ id: orderTable.id })
        .from(mpCheckoutTable)
        .innerJoin(orderTable, eq(orderTable.id, mpCheckoutTable.orderId))
        .where(
          and(
            eq(mpCheckoutTable.storeId, ctx.storeId),
            eq(orderTable.status, "pending"),
          ),
        )
        .limit(1);
      if (pending.length)
        throw new Error(
          "Há pagamentos pendentes. Resolva esses pedidos antes de desconectar.",
        );
      await tx
        .delete(mpOAuthStateTable)
        .where(eq(mpOAuthStateTable.storeId, ctx.storeId));
      // Retain credentials only for historical refunds/webhooks; never for new sales.
      await tx
        .update(mpConnectionTable)
        .set({ status: "disconnected", updatedAt: new Date() })
        .where(eq(mpConnectionTable.storeId, ctx.storeId));
      await tx
        .update(storeTable)
        .set({ enableOnlinePayments: false, updatedAt: new Date() })
        .where(eq(storeTable.id, ctx.storeId));
    }
  });
  revalidatePath("/admin/settings");
  return { success: true };
});
