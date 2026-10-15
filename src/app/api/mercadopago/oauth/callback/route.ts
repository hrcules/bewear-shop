import { and, eq, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { mpConnectionTable, mpOAuthStateTable, storeTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { MpApiError, mpFetch, tokenSchema } from "@/lib/mercadopago/api";
import {
  mpEnabled,
  mpTestMode,
  oauthConfig,
  storeOrigin,
} from "@/lib/mercadopago/config";
import { storePaymentLock } from "@/lib/mercadopago/connection";
import { decrypt, encrypt, hash } from "@/lib/mercadopago/security";

export const runtime = "nodejs";

function text(message: string, status: number) {
  return new NextResponse(message, { status });
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const state = request.nextUrl.searchParams.get("state");

  if (!mpEnabled() || !session || !state || state.length > 128) {
    return text(
      "Autorização inválida ou expirada. Reinicie a conexão nas configurações.",
      400,
    );
  }

  // O state é consumido uma única vez e só vale para o mesmo usuário/sessão.
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
    return text("Autorização inválida, expirada ou já utilizada.", 400);
  }

  const store = await db.query.storeTable.findFirst({
    where: eq(storeTable.id, attempt.storeId),
  });

  if (!store || store.ownerId !== session.user.id) {
    return text("Não autorizado.", 403);
  }

  const target = new URL("/admin/settings", storeOrigin(store.slug));

  try {
    const code = request.nextUrl.searchParams.get("code");
    if (request.nextUrl.searchParams.has("error") || !code) {
      throw new Error("Autorização recusada.");
    }

    const testMode = mpTestMode();

    const token = tokenSchema.parse(
      await mpFetch("/oauth/token", {
        body: {
          ...oauthConfig(),
          code,
          grant_type: "authorization_code",
          code_verifier: decrypt(attempt.verifierEncrypted, attempt.storeId),
          ...(testMode ? { test_token: "true" } : {}),
        },
      }),
    );

    // DIAGNÓSTICO TEMPORÁRIO (sem segredos): o que o OAuth devolveu.
    console.info("MP OAuth token recebido", {
      testModeEnv: testMode,
      sentTestToken: testMode,
      liveModeFromMp: token.live_mode,
      tokenPrefix: token.access_token.split("-")[0],
      sellerId: token.user_id,
      scope: token.scope,
    });

    // Em teste o token deve ser de sandbox; em produção, live.
    const expectedLiveMode = !testMode;
    if (token.live_mode !== undefined && token.live_mode !== expectedLiveMode) {
      throw new Error("Ambiente divergente.");
    }

    if (!token.scope.split(" ").includes("offline_access")) {
      throw new Error("Permissão de renovação ausente.");
    }

    await db.transaction(async (tx) => {
      await tx.execute(storePaymentLock(store.id));

      const [previous] = await tx
        .select()
        .from(mpConnectionTable)
        .where(eq(mpConnectionTable.storeId, store.id))
        .for("update");

      const values = {
        sellerId: token.user_id,
        accessTokenEncrypted: encrypt(token.access_token, store.id),
        refreshTokenEncrypted: encrypt(token.refresh_token, store.id),
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
        liveMode: expectedLiveMode,
        status: "connected",
        updatedAt: new Date(),
      };

      if (previous) {
        await tx
          .update(mpConnectionTable)
          .set(values)
          .where(eq(mpConnectionTable.storeId, store.id));
      } else {
        await tx.insert(mpConnectionTable).values({ storeId: store.id, ...values });
      }
    });

    target.searchParams.set("mp", "connected");
  } catch (error) {
    console.error("Mercado Pago OAuth callback falhou", {
      message: error instanceof Error ? error.message : "Erro desconhecido",
      status: error instanceof MpApiError ? error.status : undefined,
      details: error instanceof MpApiError ? error.details : undefined,
      storeId: store.id,
    });
    target.searchParams.set("mp", "error");
  }

  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
