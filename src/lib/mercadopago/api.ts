import { z } from "zod";

export class MpApiError extends Error {
  constructor(public status: number) {
    super(`Mercado Pago indisponível (${status}).`);
  }
}
export async function mpFetch(
  path: string,
  token?: string,
  body?: unknown,
  method?: string,
): Promise<unknown> {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new MpApiError(response.status);
  return response.json();
}
export const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
  user_id: z.union([z.number(), z.string()]).transform(String),
  live_mode: z.boolean(),
  scope: z.string(),
});
export const paymentSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  collector_id: z.union([z.number(), z.string()]).transform(String),
  external_reference: z.string(),
  transaction_amount: z.number().positive(),
  currency_id: z.string(),
  status: z.string(),
  live_mode: z.boolean(),
});
export type MpPayment = z.infer<typeof paymentSchema>;
