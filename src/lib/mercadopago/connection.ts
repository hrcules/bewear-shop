import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { mpConnectionTable } from "@/db/schema";

import { MpApiError, mpFetch, tokenSchema } from "./api";
import { mpTestMode, oauthConfig } from "./config";
import { decrypt, encrypt } from "./security";

export const storePaymentLock = (storeId: string) =>
  sql`select pg_advisory_xact_lock(hashtextextended(${"mp-store:" + storeId}, 0))`;

/**
 * Retorna o access token do lojista, renovando se faltar menos de 1 minuto.
 * O lock de linha serializa renovações concorrentes (várias instâncias).
 */
export async function connectionToken(storeId: string) {
  const result = await db.transaction(async (tx) => {
    const [connection] = await tx
      .select()
      .from(mpConnectionTable)
      .where(eq(mpConnectionTable.storeId, storeId))
      .for("update");

    if (!connection || connection.status !== "connected") return null;

    if (connection.expiresAt.getTime() > Date.now() + 60_000) {
      return {
        sellerId: connection.sellerId,
        liveMode: connection.liveMode,
        token: decrypt(connection.accessTokenEncrypted, storeId),
      };
    }

    try {
      const token = tokenSchema.parse(
        await mpFetch("/oauth/token", {
          body: {
            ...oauthConfig(),
            grant_type: "refresh_token",
            refresh_token: decrypt(connection.refreshTokenEncrypted, storeId),
            ...(mpTestMode() ? { test_token: "true" } : {}),
          },
        }),
      );

      if (token.user_id !== connection.sellerId) {
        throw new Error("Conta divergente.");
      }

      await tx
        .update(mpConnectionTable)
        .set({
          accessTokenEncrypted: encrypt(token.access_token, storeId),
          refreshTokenEncrypted: encrypt(token.refresh_token, storeId),
          expiresAt: new Date(Date.now() + token.expires_in * 1000),
          updatedAt: new Date(),
        })
        .where(eq(mpConnectionTable.storeId, storeId));

      return {
        sellerId: connection.sellerId,
        liveMode: connection.liveMode,
        token: token.access_token,
      };
    } catch (error) {
      if (
        error instanceof MpApiError &&
        [400, 401, 403].includes(error.status)
      ) {
        await tx
          .update(mpConnectionTable)
          .set({ status: "reconnect", updatedAt: new Date() })
          .where(eq(mpConnectionTable.storeId, storeId));
        return null;
      }
      throw error;
    }
  });

  if (!result) {
    throw new Error("Reconecte a conta Mercado Pago nas configurações da loja.");
  }
  return result;
}
