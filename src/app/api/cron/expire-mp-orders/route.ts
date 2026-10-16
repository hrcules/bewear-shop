import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { expireStaleOrders } from "@/lib/mercadopago/expire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sem segredo configurado, ninguém entra
  const received = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// A Vercel Cron envia "Authorization: Bearer $CRON_SECRET" automaticamente.
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    console.warn("Cron expire-mp-orders: acesso negado", {
      secretConfigured: Boolean(process.env.CRON_SECRET),
      authorizationHeaderSent: Boolean(request.headers.get("authorization")),
    });
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const summary = await expireStaleOrders();
  console.info("Mercado Pago: expiração de pedidos pendentes", summary);
  return NextResponse.json(summary);
}
