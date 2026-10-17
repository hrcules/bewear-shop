import { z } from "zod";

export class MpApiError extends Error {
  constructor(
    public status: number,
    public details?: unknown,
  ) {
    super(
      typeof details === "object" &&
        details !== null &&
        "message" in details &&
        typeof details.message === "string"
        ? details.message
        : `Mercado Pago indisponível (${status}).`,
    );
  }
}

export async function mpFetch(
  path: string,
  options: {
    token?: string;
    body?: unknown;
    method?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<unknown> {
  const { token, body, method, headers } = options;

  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  const raw = await response.text();
  let details: unknown = undefined;
  if (raw) {
    try {
      details = JSON.parse(raw);
    } catch {
      details = { message: raw.slice(0, 1000) };
    }
  }

  if (!response.ok) throw new MpApiError(response.status, details);
  return details ?? null;
}

export const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
  user_id: z.union([z.number(), z.string()]).transform(String),
  live_mode: z.boolean().optional(),
  scope: z.string(),
});
