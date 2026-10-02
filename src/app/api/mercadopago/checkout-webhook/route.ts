import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { required } from "@/lib/mercadopago/config";
import { validWebhookSignature } from "@/lib/mercadopago/security";
import { processOrder } from "@/lib/mercadopago/orders";
import { processPayment } from "@/lib/mercadopago/payments";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const storeId = z
    .string()
    .uuid()
    .safeParse(request.nextUrl.searchParams.get("storeId"));
  const resourceId = request.nextUrl.searchParams.get("data.id");
  const queryType = request.nextUrl.searchParams.get("type");

  if (!storeId.success || !resourceId)
    return new NextResponse("Invalid notification", { status: 400 });

  try {
    if (
      !validWebhookSignature(
        resourceId,
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

    if (body.data.id !== resourceId)
      return new NextResponse("Mismatched resource", { status: 400 });

    const type = queryType ?? body.type;

    if (type === "order" || body.type === "order") {
      await processOrder(storeId.data, resourceId);
      return NextResponse.json({ received: true });
    }

    // Keep the payment topic temporarily for legacy Checkout Pro records.
    if (body.type === "payment" && /^\d+$/.test(resourceId)) {
      await processPayment(storeId.data, resourceId);
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch {
    console.error("Mercado Pago: webhook processing failed", {
      storeId: storeId.data,
      resourceId,
    });
    return new NextResponse("Retry later", { status: 503 });
  }
}
