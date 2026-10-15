import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export function hash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

/** Aceita 32 bytes em hexadecimal (64 chars) ou em base64/base64url. */
function key() {
  const raw = process.env.MP_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("Configuração ausente: MP_TOKEN_ENCRYPTION_KEY");

  const buffer = /^[a-f0-9]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (buffer.length !== 32) {
    throw new Error("MP_TOKEN_ENCRYPTION_KEY deve ter exatamente 32 bytes.");
  }
  return buffer;
}

/** AES-256-GCM; `context` (ex.: storeId) amarra o segredo à loja. */
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
  if (version !== "v1" || !iv || !tag || !data) {
    throw new Error("Credencial inválida.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
