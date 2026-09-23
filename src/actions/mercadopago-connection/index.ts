"use server";

import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  mpCheckoutTable,
  mpConnectionTable,
  mpOAuthStateTable,
  orderTable,
  storeTable,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  connectionToken,
  storePaymentLock,
} from "@/lib/mercadopago/connection";
import { mpEnabled, oauthConfig, required } from "@/lib/mercadopago/config";
import { encrypt, hash } from "@/lib/mercadopago/security";
import { tenantOwnerAction } from "@/lib/safe-action";

import { connectionCommandSchema } from "./schema";

export const connectMercadoPago = tenantOwnerAction<void, { url: string }>(
  async (_, ctx) => {
    if (!mpEnabled()) {
      throw new Error("Conexão Mercado Pago ainda não disponível.");
    }

    const config = oauthConfig();

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      throw new Error("Faça login novamente.");
    }

    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");

    await db.transaction(async (tx) => {
      // Remove estados OAuth anteriores da mesma loja/usuário.
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

    return {
      url: url.toString(),
    };
  },
);

export const manageMercadoPago = tenantOwnerAction<
  unknown,
  { success: boolean }
>(async (input, ctx) => {
  const command = connectionCommandSchema.parse(input);

  /*
   * Antes de ativar o Checkout Pro, validamos que toda a
   * infraestrutura necessária está disponível.
   */
  if (command === "enable") {
    if (!mpEnabled()) {
      throw new Error("Integração ainda não disponível.");
    }

    required("MP_WEBHOOK_SECRET");

    // Também garante que existe uma conexão válida
    // e tenta renovar o token caso necessário.
    await connectionToken(ctx.storeId);
  }

  await db.transaction(async (tx) => {
    /*
     * Serializa alterações relacionadas aos pagamentos da loja.
     * Isso evita duas operações concorrentes alterando
     * o provedor ao mesmo tempo.
     */
    await tx.execute(storePaymentLock(ctx.storeId));

    const [store] = await tx
      .select()
      .from(storeTable)
      .where(eq(storeTable.id, ctx.storeId))
      .for("update");

    if (!store || store.ownerId !== ctx.userId) {
      throw new Error("Não autorizado.");
    }

    /*
     * ==========================================================
     * ATIVAR CHECKOUT PRO
     * ==========================================================
     */
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
      ) {
        throw new Error("Reconecte sua conta.");
      }

      /*
       * O desconto PIX pertence ao fluxo legado.
       *
       * No Checkout Pro o meio de pagamento é escolhido
       * dentro do Mercado Pago, então a BEWEAR não aplica
       * esse desconto diretamente.
       *
       * Em vez de obrigar o lojista a zerar manualmente,
       * fazemos isso automaticamente ao migrar a loja para
       * o novo Checkout Pro.
       */
      await tx
        .update(storeTable)
        .set({
          checkoutProvider: "mercadopago",
          pixDiscountPercent: 0,
          updatedAt: new Date(),
        })
        .where(eq(storeTable.id, ctx.storeId));
    } else if (command === "disable") {

    /*
     * ==========================================================
     * VOLTAR PARA O PROVEDOR LEGADO
     * ==========================================================
     *
     * Mantemos esse comando internamente durante a transição,
     * mesmo que ele não seja mais apresentado ao lojista na UI.
     */
      await tx
        .update(storeTable)
        .set({
          checkoutProvider: "legacy",
          updatedAt: new Date(),
        })
        .where(eq(storeTable.id, ctx.storeId));
    } else {

    /*
     * ==========================================================
     * DESCONECTAR MERCADO PAGO
     * ==========================================================
     */
      /*
       * Não permitimos desconectar enquanto existem pagamentos
       * pendentes vinculados ao novo Checkout Pro.
       */
      const pending = await tx
        .select({
          id: orderTable.id,
        })
        .from(mpCheckoutTable)
        .innerJoin(orderTable, eq(orderTable.id, mpCheckoutTable.orderId))
        .where(
          and(
            eq(mpCheckoutTable.storeId, ctx.storeId),
            eq(orderTable.status, "pending"),
          ),
        )
        .limit(1);

      if (pending.length) {
        throw new Error(
          "Há pagamentos pendentes. Resolva esses pedidos antes de desconectar.",
        );
      }

      /*
       * Remove qualquer tentativa OAuth ainda aberta.
       */
      await tx
        .delete(mpOAuthStateTable)
        .where(eq(mpOAuthStateTable.storeId, ctx.storeId));

      /*
       * Não apagamos as credenciais criptografadas.
       *
       * Elas podem continuar sendo necessárias para conciliar
       * pedidos históricos, reembolsos e webhooks antigos.
       *
       * Apenas impedimos que sejam usadas em novas vendas.
       */
      await tx
        .update(mpConnectionTable)
        .set({
          status: "disconnected",
          updatedAt: new Date(),
        })
        .where(eq(mpConnectionTable.storeId, ctx.storeId));

      /*
       * Ao desconectar a conta, a loja volta automaticamente
       * para o modo catálogo.
       */
      await tx
        .update(storeTable)
        .set({
          enableOnlinePayments: false,
          updatedAt: new Date(),
        })
        .where(eq(storeTable.id, ctx.storeId));
    }
  });

  revalidatePath("/admin/settings");

  return {
    success: true,
  };
});
