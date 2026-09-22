import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import {
  decrypt,
  encrypt,
  hash,
  validWebhookSignature,
} from "../src/lib/mercadopago/security";
import { matchesPayment } from "../src/lib/mercadopago/payments";
import { mpCheckoutSchema } from "../src/actions/mercadopago-checkout/schema";
import { storeOrigin } from "../src/lib/mercadopago/config";

process.env.MP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.NEXT_PUBLIC_APP_URL = "https://bewearshop.com.br";

test("tokens cannot be moved between tenants or altered", () => {
  const encrypted = encrypt("secret-access-token", "store-a");
  assert.equal(decrypt(encrypted, "store-a"), "secret-access-token");
  assert.throws(() => decrypt(encrypted, "store-b"));
  const parts = encrypted.split(".");
  parts[3] = Buffer.from("tampered ciphertext").toString("base64url");
  assert.throws(() => decrypt(parts.join("."), "store-a"));
  assert.notEqual(encrypted, encrypt("secret-access-token", "store-a"));
});
test("PKCE matches the RFC 7636 S256 test vector", () => {
  assert.equal(
    hash("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});
test("webhook signature binds payment ID and request ID", () => {
  const secret = "test-webhook-secret";
  const signature = createHmac("sha256", secret)
    .update("id:123;request-id:req-1;ts:1704908010;")
    .digest("hex");
  assert.equal(
    validWebhookSignature(
      "123",
      "req-1",
      `ts=1704908010,v1=${signature}`,
      secret,
    ),
    true,
  );
  assert.equal(
    validWebhookSignature(
      "456",
      "req-1",
      `ts=1704908010,v1=${signature}`,
      secret,
    ),
    false,
  );
  assert.equal(
    validWebhookSignature(
      "123",
      "req-2",
      `ts=1704908010,v1=${signature}`,
      secret,
    ),
    false,
  );
  assert.equal(
    validWebhookSignature("123", "req-1", "ts=1,v1=00", secret),
    false,
  );
  assert.equal(validWebhookSignature("123", null, null, secret), false);
});
test("payment must match recipient, reference, currency, total and environment", () => {
  const checkout = {
    orderId: "order-a",
    sellerId: "seller-a",
    liveMode: false,
  };
  const payment = {
    id: "1",
    external_reference: "order-a",
    collector_id: "seller-a",
    live_mode: false,
    currency_id: "BRL",
    transaction_amount: 65,
    status: "approved",
  };
  assert.equal(matchesPayment(payment, checkout, 6500), true);
  for (const changed of [
    { collector_id: "seller-b" },
    { external_reference: "order-b" },
    { live_mode: true },
    { currency_id: "USD" },
    { transaction_amount: 64.99 },
  ])
    assert.equal(
      matchesPayment({ ...payment, ...changed }, checkout, 6500),
      false,
    );
});
test("checkout rejects invalid quantities and missing idempotency keys", () => {
  const id = "dcbd58e9-849b-48d8-b78d-eb5d71483f53";
  assert.equal(mpCheckoutSchema.safeParse({ requestKey: id }).success, true);
  for (const quantity of [0, -1, 0.5, 1000])
    assert.equal(
      mpCheckoutSchema.safeParse({
        requestKey: id,
        direct: { variantId: id, addressId: id, quantity },
      }).success,
      false,
    );
  assert.equal(mpCheckoutSchema.safeParse({}).success, false);
});
test("return destination is built from trusted root and a strict slug", () => {
  assert.equal(
    storeOrigin("minha-loja"),
    "https://minha-loja.bewearshop.com.br",
  );
  for (const slug of ["evil.com", "//evil", "loja@evil", "loja:80"])
    assert.throws(() => storeOrigin(slug));
});
