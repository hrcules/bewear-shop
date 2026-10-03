import { randomInt, randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  cartItemTable,
  cartTable,
  mpCheckoutTable,
  mpConnectionTable,
  orderItemTable,
  orderTable,
  productVariantTable,
  shippingAddressTable,
  storeTable,
} from "@/db/schema";
import type { MpCheckoutInput } from "@/actions/mercadopago-checkout/schema";
import { calculateShipping } from "@/helpers/shipping";
import { mpFetch, MpApiError } from "./api";
import { appOrigin, mpEnabled, storeOrigin } from "./config";
import {
  connectionToken,
  markConnectionInvalid,
  storePaymentLock,
} from "./connection";

export async function reserveCheckout(
  input: MpCheckoutInput,
  ctx: { userId: string; storeId: string },
) {
  if (!mpEnabled())
    throw new Error("Pagamentos temporariamente indisponíveis.");
  await connectionToken(ctx.storeId);
  return db.transaction(async (tx) => {
    await tx.execute(storePaymentLock(ctx.storeId));
    const existing = await tx.query.mpCheckoutTable.findFirst({
      where: and(
        eq(mpCheckoutTable.storeId, ctx.storeId),
        eq(mpCheckoutTable.userId, ctx.userId),
        eq(mpCheckoutTable.requestKey, input.requestKey),
      ),
    });
    if (existing) return existing.orderId;
    const store = await tx.query.storeTable.findFirst({
      where: eq(storeTable.id, ctx.storeId),
    });
    const [connection] = await tx
      .select()
      .from(mpConnectionTable)
      .where(eq(mpConnectionTable.storeId, ctx.storeId))
      .for("update");
    if (
      !store?.isActive ||
      !store.enableOnlinePayments ||
      store.checkoutProvider !== "mercadopago" ||
      !connection ||
      connection.status !== "connected"
    )
      throw new Error("Esta loja não está recebendo pagamentos online.");
    if (store.pixDiscountPercent !== 0)
      throw new Error("A loja precisa revisar a configuração de desconto Pix.");
    let addressId: string;
    let sourceCartId: string | null = null;
    let requested: { variantId: string; quantity: number }[];
    if (input.direct) {
      addressId = input.direct.addressId;
      requested = [input.direct];
    } else {
      const [cart] = await tx
        .select()
        .from(cartTable)
        .where(
          and(
            eq(cartTable.storeId, ctx.storeId),
            eq(cartTable.userId, ctx.userId),
          ),
        )
        .for("update");
      if (!cart?.shippingAddressId)
        throw new Error("Confira seu carrinho e endereço antes de continuar.");
      sourceCartId = cart.id;
      addressId = cart.shippingAddressId;
      const cartItems = await tx
        .select()
        .from(cartItemTable)
        .where(eq(cartItemTable.cartId, cart.id))
        .for("update");
      requested = cartItems.map((item) => ({
        variantId: item.productVariantId,
        quantity: item.quantity,
      }));
    }
    const address = await tx.query.shippingAddressTable.findFirst({
      where: and(
        eq(shippingAddressTable.id, addressId),
        eq(shippingAddressTable.userId, ctx.userId),
      ),
    });
    if (!address || !requested.length)
      throw new Error("Carrinho ou endereço inválido.");
    const grouped = new Map<string, number>();
    for (const item of requested) {
      if (
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > 999
      )
        throw new Error("Quantidade inválida.");
      grouped.set(
        item.variantId,
        (grouped.get(item.variantId) ?? 0) + item.quantity,
      );
    }
    const items = [];
    for (const [variantId, quantity] of [...grouped].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const variant = await tx.query.productVariantTable.findFirst({
        where: eq(productVariantTable.id, variantId),
        with: { product: true },
      });
      if (
        !variant ||
        variant.product.storeId !== ctx.storeId ||
        variant.priceInCents <= 0
      )
        throw new Error("Produto indisponível nesta loja.");
      const [reserved] = await tx
        .update(productVariantTable)
        .set({ stock: sql`${productVariantTable.stock} - ${quantity}` })
        .where(
          and(
            eq(productVariantTable.id, variantId),
            gte(productVariantTable.stock, quantity),
          ),
        )
        .returning({ id: productVariantTable.id });
      if (!reserved)
        throw new Error(
          `Estoque insuficiente para ${variant.product.name}. Ajuste seu carrinho.`,
        );
      items.push({
        id: variant.id,
        title: `${variant.product.name} (${variant.name})`,
        quantity,
        unit_price: variant.priceInCents / 100,
        currency_id: "BRL" as const,
      });
    }
    const subtotal = items.reduce(
      (sum, item) => sum + Math.round(item.unit_price * 100) * item.quantity,
      0,
    );
    const shippingInCents = calculateShipping(
      subtotal,
      store.fixedShippingFeeInCents,
      store.freeShippingThresholdInCents,
    );
    if (
      !Number.isSafeInteger(subtotal + shippingInCents) ||
      shippingInCents < 0
    )
      throw new Error("Valor inválido.");
    const orderId = randomUUID();
    let inserted = false;
    for (let n = 0; n < 10; n++) {
      const rows = await tx
        .insert(orderTable)
        .values({
          id: orderId,
          userId: ctx.userId,
          storeId: ctx.storeId,
          shippingAddressId: addressId,
          orderNumber: randomInt(100000000, 999999999),
          status: "pending",
          totalPriceInCents: subtotal + shippingInCents,
          paymentProvider: "mercadopago",
        })
        .onConflictDoNothing({ target: orderTable.orderNumber })
        .returning({ id: orderTable.id });
      if (rows.length) {
        inserted = true;
        break;
      }
    }
    if (!inserted)
      throw new Error("Não foi possível gerar o pedido. Tente novamente.");
    await tx.insert(orderItemTable).values(
      items.map((item) => ({
        orderId,
        productVariantId: item.id,
        quantity: item.quantity,
        priceInCents: Math.round(item.unit_price * 100),
      })),
    );
    await tx.insert(mpCheckoutTable).values({
      orderId,
      storeId: ctx.storeId,
      userId: ctx.userId,
      requestKey: input.requestKey,
      sourceCartId,
      sellerId: connection.sellerId,
      liveMode: connection.liveMode,
      items,
      shippingInCents,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    if (sourceCartId) {
      await tx
        .delete(cartItemTable)
        .where(eq(cartItemTable.cartId, sourceCartId));
      await tx.delete(cartTable).where(eq(cartTable.id, sourceCartId));
    }
    return orderId;
  });
}

export async function orderUrl(
  orderId: string,
  ctx: { userId: string; storeId: string },
) {
  const connection = await connectionToken(ctx.storeId);
  const checkout = await db.transaction(async (tx) => {
    const [checkout] = await tx
      .select()
      .from(mpCheckoutTable)
      .where(
        and(
          eq(mpCheckoutTable.orderId, orderId),
          eq(mpCheckoutTable.storeId, ctx.storeId),
          eq(mpCheckoutTable.userId, ctx.userId),
        ),
      )
      .for("update");
    const order = await tx.query.orderTable.findFirst({
      where: eq(orderTable.id, orderId),
    });
    if (
      !checkout ||
      order?.status !== "pending" ||
      checkout.expiresAt <= new Date()
    )
      throw new Error("Pedido não está disponível para pagamento.");
    if (
      checkout.sellerId !== connection.sellerId ||
      checkout.liveMode !== connection.liveMode
    )
      throw new Error("Conta recebedora divergente.");
    if (checkout.checkoutUrl) return checkout;
    if (checkout.status !== "new")
      throw new Error(
        "Estamos verificando a abertura do pagamento. Acompanhe este pedido e não crie outro.",
      );
    await tx
      .update(mpCheckoutTable)
      .set({ status: "creating", updatedAt: new Date() })
      .where(eq(mpCheckoutTable.orderId, orderId));
    return checkout;
  });

  if (checkout.checkoutUrl) return checkout.checkoutUrl;

  const store = await db.query.storeTable.findFirst({
    where: eq(storeTable.id, ctx.storeId),
  });
  if (!store) throw new Error("Loja não encontrada.");

  const returnUrl = `${storeOrigin(store.slug)}/checkout/mercadopago?orderId=${orderId}`;
  const order = await db.query.orderTable.findFirst({
    where: eq(orderTable.id, orderId),
  });
  const payer = order
    ? await db.query.shippingAddressTable.findFirst({
        where: and(
          eq(shippingAddressTable.id, order.shippingAddressId),
          eq(shippingAddressTable.userId, ctx.userId),
        ),
      })
    : null;
  if (!payer) throw new Error("Endereço do comprador não encontrado.");

  const productTotalInCents = checkout.items.reduce(
    (sum, item) => sum + Math.round(item.unit_price * 100) * item.quantity,
    0,
  );
  const totalInCents = productTotalInCents + checkout.shippingInCents;
  if (totalInCents !== order?.totalPriceInCents)
    throw new Error("Valor do pedido divergente.");

  const items = checkout.items.map((item) => ({
    title: item.title,
    quantity: item.quantity,
    unit_price: item.unit_price.toFixed(2),
    total_amount: (item.unit_price * item.quantity).toFixed(2),
    unit_measure: "unit",
  }));

  if (checkout.shippingInCents > 0) {
    items.push({
      title: "Frete",
      quantity: 1,
      unit_price: (checkout.shippingInCents / 100).toFixed(2),
      total_amount: (checkout.shippingInCents / 100).toFixed(2),
      unit_measure: "unit",
    });
  }

  // O sandbox do Mercado Pago exige um e-mail @testuser.com.
  // Em testes, não precisamos criar uma conta BEWEAR com esse e-mail:
  // usamos um e-mail fixo apenas no payload enviado ao Mercado Pago.
  const mercadoPagoPayerEmail =
    process.env.MP_TEST_MODE === "true" ? "test@testuser.com" : payer.email;
  const maskedEmail =
    mercadoPagoPayerEmail.length > 4
      ? `${mercadoPagoPayerEmail.slice(0, 2)}***@${mercadoPagoPayerEmail.split("@")[1] ?? "***"}`
      : "***";
  const idempotencyKey = checkout.requestKey;
  const requestSummary = {
    orderId,
    sellerId: checkout.sellerId,
    liveMode: checkout.liveMode,
    payerEmail: maskedEmail,
    totalAmount: (totalInCents / 100).toFixed(2),
    itemCount: items.length,
    idempotencyKey,
    callbackConfigured: true,
  };

  console.info("[MercadoPago][Orders] Creating order", requestSummary);

  try {
    const created = z
      .object({
        id: z.string().min(1),
        user_id: z.union([z.string(), z.number()]).transform(String),
        external_reference: z.string(),
        total_amount: z.string(),
        checkout_url: z.string().url(),
      })
      .parse(
        await mpFetch(
          "/v1/orders",
          connection.token,
          {
            type: "online",
            processing_mode: "manual",
            total_amount: (totalInCents / 100).toFixed(2),
            external_reference: orderId,
            expiration_time: "P1D",
            payer: {
              email: mercadoPagoPayerEmail,
            },
            items,
            config: {
              online: {
                success_url: returnUrl,
                pending_url: returnUrl,
                failure_url: returnUrl,
                auto_return: "approved",
                callback_url: `${appOrigin()}/api/mercadopago/checkout-webhook?storeId=${ctx.storeId}`,
              },
            },
          },
          "POST",
          { "X-Idempotency-Key": checkout.requestKey },
        ),
      );

    if (created.user_id !== checkout.sellerId)
      throw new Error("Recebedor divergente.");
    if (created.external_reference !== orderId)
      throw new Error("Referência do pedido divergente.");
    if (created.total_amount !== (totalInCents / 100).toFixed(2))
      throw new Error("Valor retornado pelo Mercado Pago divergente.");

    const target = new URL(created.checkout_url);
    if (
      target.protocol !== "https:" ||
      !(
        target.hostname === "mercadopago.com.br" ||
        target.hostname.endsWith(".mercadopago.com.br")
      )
    )
      throw new Error("URL de checkout inválida.");

    await db
      .update(mpCheckoutTable)
      .set({
        mercadoPagoOrderId: created.id,
        checkoutUrl: created.checkout_url,
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(mpCheckoutTable.orderId, orderId));

    return created.checkout_url;
  } catch (error) {
    const errorInfo =
      error instanceof MpApiError
        ? {
            type: "mercado_pago_api_error",
            status: error.status,
            message: error.message,
            details: error.details,
          }
        : {
            type: error instanceof Error ? error.name : "unknown_error",
            message: error instanceof Error ? error.message : String(error),
          };

    console.error(
      "[MercadoPago][Orders] Failed to create order",
      JSON.stringify(
        {
          ...requestSummary,
          error: errorInfo,
        },
        null,
        2,
      ),
    );

    if (error instanceof MpApiError && [401, 403].includes(error.status))
      await markConnectionInvalid(ctx.storeId);

    await db
      .update(mpCheckoutTable)
      .set({
        status: "review",
        reviewReason:
          error instanceof MpApiError
            ? `order_creation_failed_${error.status}`
            : "order_creation_failed",
        updatedAt: new Date(),
      })
      .where(eq(mpCheckoutTable.orderId, orderId));

    throw new Error(
      "Não foi possível abrir o pagamento. Seu pedido foi salvo e precisa de verificação antes de tentar novamente.",
    );
  }
}
