import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { required } from "@/lib/mercadopago/config";
import { validWebhookSignature } from "@/lib/mercadopago/security";
import { processPayment } from "@/lib/mercadopago/payments";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const storeId = z
    .string()
    .uuid()
    .safeParse(request.nextUrl.searchParams.get("storeId"));
  const paymentId = request.nextUrl.searchParams.get("data.id");
  if (!storeId.success || !paymentId || !/^\d+$/.test(paymentId))
    return new NextResponse("Invalid notification", { status: 400 });
  try {
    if (
      !validWebhookSignature(
        paymentId,
        request.headers.get("x-request-id"),
        request.headers.get("x-signature"),
        required("MP_WEBHOOK_SECRET"),
      )
    )
      return new NextResponse("Invalid signature", { status: 401 });
    const body = z
      .object({
        type: z.string(),
        data: z.object({
          id: z.union([z.number(), z.string()]).transform(String),
        }),
      })
      .parse(await request.json());
    if (body.data.id !== paymentId)
      return new NextResponse("Mismatched resource", { status: 400 });
    if (body.type !== "payment") return NextResponse.json({ received: true });
    await processPayment(storeId.data, paymentId);
    return NextResponse.json({ received: true });
  } catch {
    // Keep credentials, payment payload and payer PII out of logs and responses.
    console.error("Mercado Pago: payment processing failed", {
      storeId: storeId.data,
      paymentId,
    });
    return new NextResponse("Retry later", { status: 503 });
  }
}
