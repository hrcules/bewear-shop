import { and, eq, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import {
  mpCheckoutTable,
  mpConnectionTable,
  mpOAuthStateTable,
  storeTable,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { MpApiError, mpFetch, tokenSchema } from "@/lib/mercadopago/api";
import { mpEnabled, oauthConfig, storeOrigin } from "@/lib/mercadopago/config";
import { storePaymentLock } from "@/lib/mercadopago/connection";
import { decrypt, encrypt, hash } from "@/lib/mercadopago/security";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const state = request.nextUrl.searchParams.get("state");

  if (!mpEnabled() || !session || !state || state.length > 128) {
    return new NextResponse(
      "Autorização inválida ou expirada. Reinicie a conexão nas configurações.",
      {
        status: 400,
      },
    );
  }

  // O state é consumido uma única vez.
  const [attempt] = await db
    .delete(mpOAuthStateTable)
    .where(
      and(
        eq(mpOAuthStateTable.stateHash, hash(state)),
        eq(mpOAuthStateTable.userId, session.user.id),
        eq(mpOAuthStateTable.sessionHash, hash(session.session.id)),
        gt(mpOAuthStateTable.expiresAt, new Date()),
      ),
    )
    .returning();

  if (!attempt) {
    return new NextResponse("Autorização inválida, expirada ou já utilizada.", {
      status: 400,
    });
  }

  const store = await db.query.storeTable.findFirst({
    where: eq(storeTable.id, attempt.storeId),
  });

  if (!store || store.ownerId !== session.user.id) {
    return new NextResponse("Não autorizado.", {
      status: 403,
    });
  }

  const target = new URL("/admin/settings", storeOrigin(store.slug));

  try {
    const code = request.nextUrl.searchParams.get("code");

    if (request.nextUrl.searchParams.has("error") || !code) {
      throw new Error("Autorização recusada.");
    }

    // ==========================================================
    // TROCA DO AUTHORIZATION CODE PELOS TOKENS
    // ==========================================================

    const token = tokenSchema.parse(
      await mpFetch("/oauth/token", undefined, {
        ...oauthConfig(),
        code,
        grant_type: "authorization_code",
        code_verifier: decrypt(attempt.verifierEncrypted, attempt.storeId),
        test_token: process.env.MP_TEST_MODE === "true",
      }),
    );

    // ==========================================================
    // VALIDAÇÃO DO AMBIENTE
    // ==========================================================

    const isTestMode = process.env.MP_TEST_MODE === "true";

    /*
     * Em homologação:
     *
     * MP_TEST_MODE=true
     * → esperamos liveMode=false
     *
     * Em produção:
     *
     * MP_TEST_MODE=false
     * → esperamos liveMode=true
     */
    const expectedLiveMode = !isTestMode;

    /*
     * Algumas respostas OAuth do Mercado Pago não estão
     * retornando live_mode.
     *
     * Quando isso acontecer, usamos o ambiente que a BEWEAR
     * explicitamente solicitou.
     */
    const liveMode = token.live_mode ?? expectedLiveMode;

    /*
     * Se o Mercado Pago informou explicitamente live_mode,
     * ele precisa bater com o ambiente esperado.
     */
    if (token.live_mode !== undefined && token.live_mode !== expectedLiveMode) {
      throw new Error("Ambiente divergente.");
    }

    // ==========================================================
    // REFRESH TOKEN
    // ==========================================================

    if (!token.scope.split(" ").includes("offline_access")) {
      throw new Error("Permissão de renovação ausente.");
    }

    // ==========================================================
    // SALVAR CONEXÃO
    // ==========================================================

    await db.transaction(async (tx) => {
      await tx.execute(storePaymentLock(store.id));

      const [currentStore] = await tx
        .select()
        .from(storeTable)
        .where(eq(storeTable.id, store.id))
        .for("update");

      if (!currentStore || currentStore.ownerId !== session.user.id) {
        throw new Error("Não autorizado.");
      }

      const [previous] = await tx
        .select()
        .from(mpConnectionTable)
        .where(eq(mpConnectionTable.storeId, store.id))
        .for("update");

      /*
       * Impede trocar silenciosamente o recebedor de uma
       * loja que já possui histórico de Checkout Pro.
       */
      if (
        previous &&
        (previous.sellerId !== token.user_id || previous.liveMode !== liveMode)
      ) {
        const history = await tx
          .select({
            id: mpCheckoutTable.orderId,
          })
          .from(mpCheckoutTable)
          .where(eq(mpCheckoutTable.storeId, store.id))
          .limit(1);

        if (history.length) {
          throw new Error(
            "Troca de recebedor exige conciliação dos pedidos anteriores.",
          );
        }
      }

      const values = {
        sellerId: token.user_id,

        accessTokenEncrypted: encrypt(token.access_token, store.id),

        refreshTokenEncrypted: encrypt(token.refresh_token, store.id),

        expiresAt: new Date(Date.now() + token.expires_in * 1000),

        // Agora é SEMPRE boolean.
        liveMode,

        status: "connected",
        updatedAt: new Date(),
      };

      await tx
        .insert(mpConnectionTable)
        .values({
          storeId: store.id,
          ...values,
        })
        .onConflictDoUpdate({
          target: mpConnectionTable.storeId,
          set: values,
        });
    });

    target.searchParams.set("mp", "connected");
  } catch (error) {
    console.error("❌ Mercado Pago OAuth callback falhou", {
      message: error instanceof Error ? error.message : "Erro desconhecido",

      status: error instanceof MpApiError ? error.status : undefined,

      storeId: store.id,
    });

    target.searchParams.set("mp", "error");
  }

  const response = NextResponse.redirect(target);

  response.headers.set("Cache-Control", "no-store");

  response.headers.set("Referrer-Policy", "no-referrer");

  return response;
}
