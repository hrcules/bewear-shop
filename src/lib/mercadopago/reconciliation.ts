import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  mpCheckoutTable,
  orderItemTable,
  orderTable,
  productVariantTable,
} from "@/db/schema";
import { mpFetch, paymentSchema } from "./api";
import { connectionToken } from "./connection";
import { processPayment } from "./payments";

const preferenceSchema = z.object({
  id: z.string(),
  collector_id: z.number(),
  external_reference: z.string(),
  init_point: z.string().url(),
  sandbox_init_point: z.string().url(),
  expires: z.boolean().optional(),
  expiration_date_to: z.string().nullable().optional(),
});
export async function reconcileCheckout(orderId: string, storeId: string) {
  const connection = await connectionToken(storeId, true);
  const checkout = await db.query.mpCheckoutTable.findFirst({
    where: and(
      eq(mpCheckoutTable.orderId, orderId),
      eq(mpCheckoutTable.storeId, storeId),
    ),
  });
  if (!checkout || checkout.sellerId !== connection.sellerId)
    throw new Error("Pedido não pertence à conexão.");
  if (
    !checkout.preferenceId &&
    ["review", "creating"].includes(checkout.status)
  ) {
    const search = z
      .object({
        total: z.number(),
        elements: z.array(z.object({ id: z.string() })),
      })
      .parse(
        await mpFetch(
          `/checkout/preferences/search?external_reference=${orderId}`,
          connection.token,
        ),
      );
    if (search.total === 1 && search.elements.length === 1) {
      const preference = preferenceSchema.parse(
        await mpFetch(
          `/checkout/preferences/${encodeURIComponent(search.elements[0].id)}`,
          connection.token,
        ),
      );
      if (
        String(preference.collector_id) !== checkout.sellerId ||
        preference.external_reference !== orderId
      )
        throw new Error("Preferência divergente.");
      const url = connection.liveMode
        ? preference.init_point
        : preference.sandbox_init_point;
      const target = new URL(url);
      if (
        target.protocol !== "https:" ||
        !target.hostname.endsWith(".mercadopago.com.br")
      )
        throw new Error("URL inválida.");
      await db
        .update(mpCheckoutTable)
        .set({
          preferenceId: preference.id,
          checkoutUrl: url,
          status: "ready",
          reviewReason: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mpCheckoutTable.orderId, orderId),
            eq(mpCheckoutTable.status, checkout.status),
          ),
        );
    }
  }
  const result = z
    .object({
      paging: z.object({ total: z.number() }),
      results: z.array(paymentSchema),
    })
    .parse(
      await mpFetch(
        `/v1/payments/search?external_reference=${orderId}&limit=100&sort=date_created&criteria=desc`,
        connection.token,
      ),
    );
  if (result.paging.total > result.results.length)
    throw new Error("Muitas tentativas: conciliação adicional necessária.");
  for (const payment of result.results)
    await processPayment(storeId, payment.id);
  await db
    .update(mpCheckoutTable)
    .set({ updatedAt: new Date() })
    .where(eq(mpCheckoutTable.orderId, orderId));
}

// Explicit merchant action, not a timer: a preference expiring is not proof that a Pix expired.
export async function cancelUnpaidCheckout(orderId: string, storeId: string) {
  await reconcileCheckout(orderId, storeId);
  const connection = await connectionToken(storeId, true);
  await db.transaction(async (tx) => {
    const [checkout] = await tx
      .select()
      .from(mpCheckoutTable)
      .where(
        and(
          eq(mpCheckoutTable.orderId, orderId),
          eq(mpCheckoutTable.storeId, storeId),
        ),
      )
      .for("update");
    const [order] = await tx
      .select()
      .from(orderTable)
      .where(and(eq(orderTable.id, orderId), eq(orderTable.storeId, storeId)))
      .for("update");
    if (!checkout || !order) throw new Error("Pedido não encontrado.");
    if (order.status === "cancelled") return;
    if (order.status !== "pending" || checkout.paymentId)
      throw new Error(
        "Há pagamento registrado. Confira o pedido no Mercado Pago.",
      );
    if (!checkout.preferenceId)
      throw new Error(
        "Não foi possível confirmar a preferência. Não é seguro liberar estoque ainda.",
      );
    const preference = preferenceSchema.parse(
      await mpFetch(
        `/checkout/preferences/${encodeURIComponent(checkout.preferenceId)}`,
        connection.token,
      ),
    );
    if (
      String(preference.collector_id) !== checkout.sellerId ||
      preference.external_reference !== orderId
    )
      throw new Error("Preferência divergente.");
    if (
      !preference.expires ||
      !preference.expiration_date_to ||
      new Date(preference.expiration_date_to).getTime() > Date.now() - 60000
    )
      throw new Error(
        "Aguarde o vencimento do checkout antes de cancelar a reserva.",
      );
    const result = z
      .object({
        paging: z.object({ total: z.number() }),
        results: z.array(paymentSchema),
      })
      .parse(
        await mpFetch(
          `/v1/payments/search?external_reference=${orderId}&limit=100`,
          connection.token,
        ),
      );
    if (
      result.paging.total > result.results.length ||
      result.results.some(
        (p) => !["rejected", "cancelled", "refunded"].includes(p.status),
      )
    )
      throw new Error(
        "Pagamento aprovado ou em processamento. Não é seguro liberar estoque.",
      );
    const items = await tx
      .select()
      .from(orderItemTable)
      .where(eq(orderItemTable.orderId, orderId));
    for (const item of items)
      await tx
        .update(productVariantTable)
        .set({ stock: sql`${productVariantTable.stock} + ${item.quantity}` })
        .where(eq(productVariantTable.id, item.productVariantId));
    await tx
      .update(orderTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(orderTable.id, orderId));
    await tx
      .update(mpCheckoutTable)
      .set({
        status: "cancelled",
        checkoutUrl: null,
        reviewReason: null,
        updatedAt: new Date(),
      })
      .where(eq(mpCheckoutTable.orderId, orderId));
  });
}
