import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";

// Opt-in: use an EMPTY, disposable PostgreSQL database with the current schema.
// This suite only removes its own fixtures, never resets an existing database.
test(
  "PostgreSQL: concurrent stock, retries, tenant isolation and duplicate approval",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.MP_CHECKOUT_ENABLED = "true";
    process.env.MP_TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
    const { db } = await import("../src/db");
    const s = await import("../src/db/schema");
    const { eq, inArray } = await import("drizzle-orm");
    const { encrypt } = await import("../src/lib/mercadopago/security");
    const { reserveCheckout } = await import("../src/lib/mercadopago/checkout");
    const { processPayment } = await import("../src/lib/mercadopago/payments");
    const suffix = randomUUID();
    const ownerId = `mp-test-${suffix}`;
    const buyerId = `mp-buyer-${suffix}`;
    const storeId = randomUUID();
    const otherStoreId = randomUUID();
    const categoryId = randomUUID();
    const productId = randomUUID();
    const variantId = randomUUID();
    const addressId = randomUUID();
    const originalFetch = globalThis.fetch;
    try {
      await db.insert(s.user).values(
        [ownerId, buyerId].map((id) => ({
          id,
          name: "Fixture",
          email: `${id}@example.test`,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
      await db.insert(s.storeTable).values(
        [storeId, otherStoreId].map((id) => ({
          id,
          slug: `test-${id}`,
          name: "Test",
          ownerId,
          checkoutProvider: "mercadopago",
          enableOnlinePayments: true,
        })),
      );
      await db.insert(s.mpConnectionTable).values(
        [storeId, otherStoreId].map((id) => ({
          storeId: id,
          sellerId: id === storeId ? "123" : "456",
          accessTokenEncrypted: encrypt("test", id),
          refreshTokenEncrypted: encrypt("refresh", id),
          expiresAt: new Date(Date.now() + 3600000),
          liveMode: false,
        })),
      );
      await db
        .insert(s.categoryTable)
        .values({ id: categoryId, name: "Test", slug: "test", storeId });
      await db.insert(s.productTable).values({
        id: productId,
        name: "Test",
        slug: "test",
        description: "Test",
        storeId,
        categoryId,
      });
      await db.insert(s.productVariantTable).values({
        id: variantId,
        productId,
        name: "Test",
        slug: "test",
        color: "black",
        priceInCents: 6500,
        imageUrl: "https://example.test/image.png",
        stock: 1,
      });
      await db.insert(s.shippingAddressTable).values({
        id: addressId,
        userId: buyerId,
        email: "buyer@example.test",
        fullName: "Test",
        cpf: "00000000000",
        phone: "00000000000",
        zipCode: "00000000",
        address: "Test",
        number: "1",
        neighborhood: "Test",
        city: "Test",
        state: "PB",
      });
      const ctx = { storeId, userId: buyerId };
      const input = {
        requestKey: randomUUID(),
        direct: { variantId, quantity: 1, addressId },
      };
      const results = await Promise.allSettled([
        reserveCheckout(input, ctx),
        reserveCheckout({ ...input, requestKey: randomUUID() }, ctx),
      ]);
      assert.equal(
        results.filter((r) => r.status === "fulfilled").length,
        1,
        "only one buyer reserves the final unit",
      );
      const variant = await db.query.productVariantTable.findFirst({
        where: eq(s.productVariantTable.id, variantId),
      });
      assert.equal(variant?.stock, 0);
      const saved = await db
        .select()
        .from(s.mpCheckoutTable)
        .where(eq(s.mpCheckoutTable.storeId, storeId));
      assert.equal(
        saved.length,
        1,
        "losing transaction leaves no partial order",
      );
      const retry = await reserveCheckout(
        { ...input, requestKey: saved[0].requestKey },
        ctx,
      );
      assert.equal(
        retry,
        saved[0].orderId,
        "retry returns the same order without reserving again",
      );
      await assert.rejects(
        reserveCheckout(
          { ...input, requestKey: randomUUID() },
          { storeId: otherStoreId, userId: buyerId },
        ),
      );
      const payment = {
        id: 777,
        external_reference: retry,
        collector_id: 123,
        live_mode: false,
        currency_id: "BRL",
        transaction_amount: 65,
        status: "approved",
      };
      globalThis.fetch = async () => Response.json(payment);
      await Promise.all([
        processPayment(storeId, "777"),
        processPayment(storeId, "777"),
      ]);
      const order = await db.query.orderTable.findFirst({
        where: eq(s.orderTable.id, retry),
      });
      assert.equal(order?.status, "paid");
      const notices = await db
        .select()
        .from(s.notificationTable)
        .where(eq(s.notificationTable.userId, ownerId));
      assert.equal(
        notices.length,
        1,
        "one merchant notification for duplicate approvals",
      );
      const emails = await db
        .select()
        .from(s.mpEmailTable)
        .where(eq(s.mpEmailTable.orderId, retry));
      assert.equal(emails.length, 2, "one outbox job per recipient");
      globalThis.fetch = async () =>
        Response.json({ ...payment, collector_id: 456 });
      await assert.rejects(processPayment(storeId, "777"), /incompatível/);
    } finally {
      globalThis.fetch = originalFetch;
      const orders = await db
        .select({ id: s.orderTable.id })
        .from(s.orderTable)
        .where(inArray(s.orderTable.storeId, [storeId, otherStoreId]));
      if (orders.length) {
        const ids = orders.map((o) => o.id);
        await db
          .delete(s.mpEmailTable)
          .where(inArray(s.mpEmailTable.orderId, ids));
        await db
          .delete(s.mpCheckoutTable)
          .where(inArray(s.mpCheckoutTable.orderId, ids));
        await db
          .delete(s.orderItemTable)
          .where(inArray(s.orderItemTable.orderId, ids));
        await db.delete(s.orderTable).where(inArray(s.orderTable.id, ids));
      }
      await db
        .delete(s.productVariantTable)
        .where(eq(s.productVariantTable.id, variantId));
      await db.delete(s.productTable).where(eq(s.productTable.id, productId));
      await db
        .delete(s.categoryTable)
        .where(eq(s.categoryTable.id, categoryId));
      await db
        .delete(s.shippingAddressTable)
        .where(eq(s.shippingAddressTable.id, addressId));
      await db
        .delete(s.storeTable)
        .where(inArray(s.storeTable.id, [storeId, otherStoreId]));
      await db.delete(s.user).where(inArray(s.user.id, [ownerId, buyerId]));
      if ("end" in db.$client) await db.$client.end();
    }
  },
);
