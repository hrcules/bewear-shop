import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export function hash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}
function key() {
  const raw = process.env.MP_TOKEN_ENCRYPTION_KEY;
  if (!raw || !/^[a-f0-9]{64}$/i.test(raw))
    throw new Error(
      "MP_TOKEN_ENCRYPTION_KEY deve conter 32 bytes em hexadecimal.",
    );
  return Buffer.from(raw, "hex");
}
export function encrypt(value: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}
export function decrypt(value: string, context: string) {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data)
    throw new Error("Credencial inválida.");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    cipher.update(Buffer.from(data, "base64url")),
    cipher.final(),
  ]).toString("utf8");
}
export function validWebhookSignature(
  dataId: string,
  requestId: string | null,
  signature: string | null,
  secret: string,
) {
  if (!dataId || !requestId || !signature || !secret) return false;
  const parts = Object.fromEntries(
    signature.split(",").map((p) => p.trim().split("=")),
  );
  if (!/^\d+$/.test(parts.ts ?? "") || !/^[a-f0-9]{64}$/i.test(parts.v1 ?? ""))
    return false;
  const expected = createHmac("sha256", secret)
    .update(
      `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`,
    )
    .digest();
  return timingSafeEqual(expected, Buffer.from(parts.v1, "hex"));
}
