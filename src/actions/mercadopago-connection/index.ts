"use server";

import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { db } from "@/db";
import { mpConnectionTable, mpOAuthStateTable, storeTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { mpEnabled, oauthConfig } from "@/lib/mercadopago/config";
import {
  connectionToken,
  storePaymentLock,
} from "@/lib/mercadopago/connection";
import { encrypt, hash } from "@/lib/mercadopago/security";
import { tenantOwnerAction } from "@/lib/safe-action";

/**
 * Inicia o OAuth: grava state + code_verifier (PKCE) e devolve a URL de
 * autorização do Mercado Pago. O state é de uso único e expira em 10 min.
 */
export const connectMercadoPago = tenantOwnerAction<void, { url: string }>(
  async (_, ctx) => {
    if (!mpEnabled()) {
      throw new Error("Conexão Mercado Pago ainda não disponível.");
    }

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

/**
 * Desconecta a conta. Os tokens criptografados são mantidos (para conciliar
 * pedidos antigos), mas deixam de ser usados em novas vendas.
 */
export const disconnectMercadoPago = tenantOwnerAction<
  void,
  { success: boolean }
>(async (_, ctx) => {
  await db.transaction(async (tx) => {
    await tx.execute(storePaymentLock(ctx.storeId));

    await tx
      .delete(mpOAuthStateTable)
      .where(eq(mpOAuthStateTable.storeId, ctx.storeId));

    await tx
      .update(mpConnectionTable)
      .set({ status: "disconnected", updatedAt: new Date() })
      .where(eq(mpConnectionTable.storeId, ctx.storeId));
  });

  revalidatePath("/admin/settings");
  return { success: true };
});

/**
 * Liga/desliga o Mercado Pago como forma de pagamento da loja.
 * Só liga se existir uma conexão válida.
 */
export const setMercadoPagoCheckout = tenantOwnerAction<
  boolean,
  { success: boolean }
>(async (enabled, ctx) => {
  if (enabled) {
    if (!mpEnabled()) throw new Error("Integração ainda não disponível.");
    await connectionToken(ctx.storeId); // valida/renova o token
  }

  await db
    .update(storeTable)
    .set({
      checkoutProvider: enabled ? "mercadopago" : "legacy",
      updatedAt: new Date(),
    })
    .where(eq(storeTable.id, ctx.storeId));

  revalidatePath("/admin/settings");
  return { success: true };
});
