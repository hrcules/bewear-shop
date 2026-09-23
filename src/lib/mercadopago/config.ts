export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Configuração ausente: ${name}`);
  return value;
}
export function mpEnabled() {
  return process.env.MP_CHECKOUT_ENABLED === "true";
}
export function appOrigin() {
  const url = new URL(required("NEXT_PUBLIC_APP_URL"));
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("HTTPS obrigatório.");
  return url.origin;
}
export function storeOrigin(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error("Slug inválido.");
  const url = new URL(appOrigin());
  url.hostname = `${slug}.${url.hostname}`;
  return url.origin;
}
export function oauthConfig() {
  return {
    client_id: required("MP_CLIENT_ID"),
    client_secret: required("MP_CLIENT_SECRET"),
    redirect_uri: `${appOrigin()}/api/mercadopago/oauth/callback`,
  };
}
