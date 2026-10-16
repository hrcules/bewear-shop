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
import { MpApiError, mpFetch } from "@/lib/mercadopago/api";
import { appOrigin, storeOrigin } from "@/lib/mercadopago/config";
import { connectionToken } from "@/lib/mercadopago/connection";
import { buildPayer } from "@/lib/mercadopago/payer";
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
    with: { shippingAddress: true },
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

  type MpItem = {
    id: string;
    title: string;
    description?: string;
    picture_url?: string;
    quantity: number;
    unit_price: number;
    currency_id: "BRL";
  };

  const mpItems: MpItem[] = items.map((item) => {
    const imageUrl = item.productVariant.imageUrl;
    const description = item.productVariant.product.description?.trim();
    return {
      id: item.productVariantId,
      title:
        `${item.productVariant.product.name} - ${item.productVariant.name}`.slice(
          0,
          120,
        ),
      // O checkout só exibe imagens servidas por https público.
      ...(imageUrl?.startsWith("https://") ? { picture_url: imageUrl } : {}),
      ...(description ? { description: description.slice(0, 250) } : {}),
      quantity: item.quantity,
      unit_price: item.priceInCents / 100,
      currency_id: "BRL" as const,
    };
  });
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

  const preferenceBody = {
    items: mpItems,
    external_reference: orderId,
    notification_url: `${appOrigin()}/api/mercadopago/checkout-webhook?storeId=${ctx.storeId}`,
    back_urls: { success: backUrl, pending: backUrl, failure: backUrl },
    auto_return: "approved",
    expires: true,
    // O Mercado Pago espera data com offset (America/Sao_Paulo, -03:00).
    expiration_date_to: new Date(expiresAt.getTime() - 3 * 60 * 60 * 1000)
      .toISOString()
      .replace("Z", "-03:00"),
  };
  const payer = order.shippingAddress
    ? buildPayer(order.shippingAddress)
    : undefined;

  async function createPreference(body: Record<string, unknown>) {
    return preferenceSchema.parse(
      await mpFetch("/checkout/preferences", {
        token: connection.token,
        body,
      }),
    );
  }

  let preference: z.infer<typeof preferenceSchema>;
  try {
    preference = await createPreference({
      ...preferenceBody,
      ...(payer ? { payer } : {}),
    });
  } catch (error) {
    // Os dados do comprador só ajudam: se o Mercado Pago recusar algum campo,
    // o pagamento não pode parar. Tenta de novo sem eles.
    if (!payer || !(error instanceof MpApiError) || error.status !== 400) {
      throw error;
    }
    console.warn("Mercado Pago: preferência recusada com dados do comprador", {
      orderId,
      status: error.status,
      message: error.message,
    });
    preference = await createPreference(preferenceBody);
  }

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
