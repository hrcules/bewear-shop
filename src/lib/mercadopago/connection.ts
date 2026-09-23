import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { mpConnectionTable } from "@/db/schema";
import { MpApiError, mpFetch, tokenSchema } from "./api";
import { oauthConfig } from "./config";
import { decrypt, encrypt } from "./security";

// Row lock serializes refresh/disconnect/reconnect across server instances.
export async function connectionToken(storeId: string, allowDisabled = false) {
  const result = await db.transaction(async (tx) => {
    const [connection] = await tx
      .select()
      .from(mpConnectionTable)
      .where(eq(mpConnectionTable.storeId, storeId))
      .for("update");
    if (
      !connection ||
      connection.status === "reconnect" ||
      (!allowDisabled && connection.status !== "connected")
    )
      return null;
    if (connection.expiresAt.getTime() > Date.now() + 60000)
      return {
        ...connection,
        token: decrypt(connection.accessTokenEncrypted, storeId),
      };
    try {
      const token = tokenSchema.parse(
        await mpFetch("/oauth/token", undefined, {
          ...oauthConfig(),
          grant_type: "refresh_token",
          refresh_token: decrypt(connection.refreshTokenEncrypted, storeId),
        }),
      );
      if (
        token.user_id !== connection.sellerId ||
        token.live_mode !== connection.liveMode
      )
        throw new Error("Conta divergente.");
      await tx
        .update(mpConnectionTable)
        .set({
          accessTokenEncrypted: encrypt(token.access_token, storeId),
          refreshTokenEncrypted: encrypt(token.refresh_token, storeId),
          expiresAt: new Date(Date.now() + token.expires_in * 1000),
          updatedAt: new Date(),
        })
        .where(eq(mpConnectionTable.storeId, storeId));
      return { ...connection, token: token.access_token };
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
  if (!result)
    throw new Error(
      "Reconecte a conta Mercado Pago nas configurações da loja.",
    );
  return result;
}
export async function markConnectionInvalid(storeId: string) {
  await db
    .update(mpConnectionTable)
    .set({ status: "reconnect", updatedAt: new Date() })
    .where(eq(mpConnectionTable.storeId, storeId));
}
export const storePaymentLock = (storeId: string) =>
  sql`select pg_advisory_xact_lock(hashtextextended(${"mp-store:" + storeId}, 0))`;
