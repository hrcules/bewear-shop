"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  mpCheckoutTable,
  orderItemTable,
  orderTable,
  storeTable,
} from "@/db/schema";
import { calculateShipping } from "@/helpers/shipping";
import { mpFetch } from "@/lib/mercadopago/api";
import { storeOrigin } from "@/lib/mercadopago/config";
import { connectionToken } from "@/lib/mercadopago/connection";
import { authenticatedAction } from "@/lib/safe-action";

const inputSchema = z.object({ orderId: z.string().uuid() });
const preferenceSchema = z.object({
  id: z.string().min(1),
  init_point: z.string().url(),
  sandbox_init_point: z.string().url().optional(),
});

const PREFERENCE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Cria (ou reaproveita) a preferência do Checkout Pro usando o token OAuth do
 * lojista, para o dinheiro cair direto na conta dele. Retorna a URL do checkout.
 */
export const createMercadoPagoCheckout = authenticatedAction<
  { orderId: string },
  { checkoutUrl: string }
>(async (data, ctx) => {
  const { orderId } = inputSchema.parse(data);

  const order = await db.query.orderTable.findFirst({
    where: eq(orderTable.id, orderId),
  });
  if (!order || order.userId !== ctx.userId || order.storeId !== ctx.storeId) {
    throw new Error("Pedido não encontrado ou não autorizado.");
  }
  if (order.status !== "pending") {
    throw new Error("Este pedido não está mais aguardando pagamento.");
  }

  const store = await db.query.storeTable.findFirst({
    where: eq(storeTable.id, ctx.storeId),
  });
  if (!store || store.checkoutProvider !== "mercadopago") {
    throw new Error("Esta loja não usa o Mercado Pago para pagamentos.");
  }

  // Reaproveita a preferência se o cliente voltou e clicou em pagar de novo.
  const existing = await db.query.mpCheckoutTable.findFirst({
    where: eq(mpCheckoutTable.orderId, orderId),
  });
  if (existing?.checkoutUrl && existing.expiresAt.getTime() > Date.now()) {
    return { checkoutUrl: existing.checkoutUrl };
  }

  const items = await db.query.orderItemTable.findMany({
    where: eq(orderItemTable.orderId, orderId),
    with: { productVariant: { with: { product: true } } },
  });
  if (!items.length) throw new Error("Pedido sem itens.");

  const subtotalInCents = items.reduce(
    (acc, item) => acc + item.priceInCents * item.quantity,
    0,
  );
  const shippingInCents = calculateShipping(
    subtotalInCents,
    store.fixedShippingFeeInCents || 0,
    store.freeShippingThresholdInCents || null,
  );
  if (subtotalInCents + shippingInCents !== order.totalPriceInCents) {
    throw new Error("O total do pedido não confere. Refaça o pedido.");
  }

  const mpItems = items.map((item) => ({
    id: item.productVariantId,
    title:
      `${item.productVariant.product.name} - ${item.productVariant.name}`.slice(
        0,
        120,
      ),
    quantity: item.quantity,
    unit_price: item.priceInCents / 100,
    currency_id: "BRL" as const,
  }));
  if (shippingInCents > 0) {
    mpItems.push({
      id: "frete",
      title: "Frete",
      quantity: 1,
      unit_price: shippingInCents / 100,
      currency_id: "BRL" as const,
    });
  }

  const connection = await connectionToken(ctx.storeId);
  const origin = storeOrigin(store.slug);
  const backUrl = `${origin}/checkout/success?orderId=${orderId}`;
  const expiresAt = new Date(Date.now() + PREFERENCE_TTL_MS);

  const preference = preferenceSchema.parse(
    await mpFetch("/checkout/preferences", {
      token: connection.token,
      body: {
        items: mpItems,
        external_reference: orderId,
        // TEMPORÁRIO (diagnóstico do erro no checkout): preferência mínima,
        // igual à que funcionou no teste manual. back_urls/auto_return/expires
        // voltam depois, um de cada vez.
        ...(process.env.MP_PREFERENCE_EXTRAS === "true"
          ? {
              back_urls: {
                success: backUrl,
                pending: backUrl,
                failure: backUrl,
              },
              auto_return: "approved",
              expires: true,
              expiration_date_to: expiresAt.toISOString(),
            }
          : {}),
      },
    }),
  );

  // DIAGNÓSTICO TEMPORÁRIO (sem segredos): dados da preferência criada.
  console.info("MP preferência criada", {
    preferenceId: preference.id,
    sellerIdSaved: connection.sellerId,
    liveModeSaved: connection.liveMode,
    tokenPrefix: connection.token.split("-")[0],
    initPointHost: new URL(preference.init_point).host,
    sandboxInitPointHost: preference.sandbox_init_point
      ? new URL(preference.sandbox_init_point).host
      : null,
    testModeEnv: process.env.MP_TEST_MODE ?? null,
  });

  // Em teste (live_mode=false) o checkout abre pelo init_point, que funcionou
  // nos testes manuais; sandbox_init_point fica só como informação.
  const checkoutUrl = preference.init_point;

  const values = {
    sellerId: connection.sellerId,
    liveMode: connection.liveMode,
    preferenceId: preference.id,
    checkoutUrl,
    status: "preference_created",
    items: mpItems,
    shippingInCents,
    expiresAt,
    updatedAt: new Date(),
  };

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(mpCheckoutTable)
        .set(values)
        .where(eq(mpCheckoutTable.orderId, orderId));
    } else {
      await tx.insert(mpCheckoutTable).values({
        orderId,
        storeId: ctx.storeId,
        userId: ctx.userId,
        requestKey: randomUUID(),
        ...values,
      });
    }
    await tx
      .update(orderTable)
      .set({ paymentProvider: "mercadopago", updatedAt: new Date() })
      .where(eq(orderTable.id, orderId));
  });

  return { checkoutUrl };
});
