import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { processPayment } from "@/lib/mercadopago/payments";
import { validWebhookSignature } from "@/lib/mercadopago/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const storeId = z
    .string()
    .uuid()
    .safeParse(request.nextUrl.searchParams.get("storeId"));
  if (!storeId.success) return new NextResponse("Invalid", { status: 400 });

  let body: { type?: string; data?: { id?: string | number } } = {};
  try {
    body = await request.json();
  } catch {
    // algumas notificações vêm só com query string
  }

  const type = request.nextUrl.searchParams.get("type") ?? body.type;
  const resourceId = String(
    request.nextUrl.searchParams.get("data.id") ?? body.data?.id ?? "",
  );

  if (type !== "payment") return NextResponse.json({ received: true });
  if (!/^\d+$/.test(resourceId)) {
    return new NextResponse("Invalid", { status: 400 });
  }

  // Se o segredo estiver configurado, a assinatura é obrigatória.
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (
    secret &&
    !validWebhookSignature(
      resourceId,
      request.headers.get("x-request-id"),
      request.headers.get("x-signature"),
      secret,
    )
  ) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  try {
    await processPayment(storeId.data, resourceId);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Mercado Pago webhook falhou", {
      storeId: storeId.data,
      paymentId: resourceId,
      message: error instanceof Error ? error.message : "erro desconhecido",
    });
    return new NextResponse("Retry later", { status: 503 });
  }
}
