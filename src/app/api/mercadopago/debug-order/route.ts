import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { mpCheckoutTable, storeTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { connectionToken } from "@/lib/mercadopago/connection";
import { mpFetch } from "@/lib/mercadopago/api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session)
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const mercadoPagoOrderId =
      request.nextUrl.searchParams.get("orderId");

    if (!mercadoPagoOrderId)
      return NextResponse.json(
        { error: "Informe orderId do Mercado Pago." },
        { status: 400 },
      );

    const store = await db.query.storeTable.findFirst({
      where: eq(storeTable.ownerId, session.user.id),
    });

    if (!store)
      return NextResponse.json(
        { error: "Loja não encontrada." },
        { status: 404 },
      );

    const connection = await connectionToken(store.id);
    const order = await mpFetch(
      `/v1/orders/${encodeURIComponent(mercadoPagoOrderId)}`,
      connection.token,
    );

    const checkout = await db.query.mpCheckoutTable.findFirst({
      where: eq(mpCheckoutTable.mercadoPagoOrderId, mercadoPagoOrderId),
    });

    return NextResponse.json({
      order,
      localCheckout: checkout
        ? {
            orderId: checkout.orderId,
            storeId: checkout.storeId,
            sellerId: checkout.sellerId,
            liveMode: checkout.liveMode,
            mercadoPagoOrderId: checkout.mercadoPagoOrderId,
            checkoutUrl: checkout.checkoutUrl,
            status: checkout.status,
            paymentId: checkout.paymentId,
            lastPaymentStatus: checkout.lastPaymentStatus,
            reviewReason: checkout.reviewReason,
          }
        : null,
    });
  } catch (error) {
    console.error("Mercado Pago debug order failed", {
      message: error instanceof Error ? error.message : "Erro desconhecido",
      details:
        typeof error === "object" &&
        error !== null &&
        "details" in error
          ? (error as { details?: unknown }).details
          : undefined,
    });

    return NextResponse.json(
      {
        error: "Não foi possível consultar a Order do Mercado Pago.",
        message: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    );
  }
}
