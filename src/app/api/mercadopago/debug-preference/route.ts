import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { storeTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { connectionToken } from "@/lib/mercadopago/connection";
import { mpFetch } from "@/lib/mercadopago/api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    // 1. Verifica se estamos logados
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    // 2. Pega a preferência pela URL
    const preferenceId = request.nextUrl.searchParams.get("preferenceId");

    if (!preferenceId) {
      return NextResponse.json(
        { error: "Informe preferenceId." },
        { status: 400 },
      );
    }

    // 3. Descobre a loja do usuário logado
    const store = await db.query.storeTable.findFirst({
      where: eq(storeTable.ownerId, session.user.id),
    });

    if (!store) {
      return NextResponse.json(
        { error: "Loja não encontrada." },
        { status: 404 },
      );
    }

    // 4. Recupera o Access Token do vendedor
    // O token é descriptografado somente no servidor.
    const connection = await connectionToken(store.id);

    // 5. Consulta a preferência no Mercado Pago
    const preference = await mpFetch(
      `/checkout/preferences/${encodeURIComponent(preferenceId)}`,
      connection.token,
    );

    // 6. Consulta os meios de pagamento disponíveis
    // para a conta Mercado Pago dessa conexão.
    const paymentMethods = await mpFetch(
      "/v1/payment_methods",
      connection.token,
    );

    // 7. Valida minimamente a resposta da preferência
    if (
      typeof preference !== "object" ||
      preference === null ||
      !("id" in preference)
    ) {
      return NextResponse.json(
        { error: "Resposta inesperada do Mercado Pago para a preferência." },
        { status: 502 },
      );
    }

    const data = preference as {
      id?: unknown;
      collector_id?: unknown;
      external_reference?: unknown;
      live_mode?: unknown;
      items?: unknown;
      payment_methods?: unknown;
      shipments?: unknown;
      back_urls?: unknown;
      auto_return?: unknown;
      init_point?: unknown;
      sandbox_init_point?: unknown;
    };

    // 8. Busca pagamentos relacionados ao pedido.
    // O external_reference da preferência é o orderId da BEWEAR.
    let payments: unknown = null;
    let paymentsSearchError: string | null = null;

    if (typeof data.external_reference === "string") {
      try {
        const params = new URLSearchParams({
          external_reference: data.external_reference,
          limit: "20",
          offset: "0",
        });

        payments = await mpFetch(
          `/v1/payments/search?${params.toString()}`,
          connection.token,
        );
      } catch (error) {
        paymentsSearchError =
          error instanceof Error ? error.message : "Erro desconhecido";
      }
    }

    // 9. Retorna somente os dados necessários para o diagnóstico.
    // O Access Token NUNCA é retornado.
    return NextResponse.json({
      preference: {
        id: data.id,
        collector_id: data.collector_id,
        external_reference: data.external_reference,
        live_mode: data.live_mode,
        items: data.items,
        payment_methods: data.payment_methods,
        shipments: data.shipments,
        back_urls: data.back_urls,
        auto_return: data.auto_return,
        init_point: data.init_point,
        sandbox_init_point: data.sandbox_init_point,
      },

      payment_methods: paymentMethods,

      payments: payments
        ? payments
        : {
            error:
              paymentsSearchError ??
              "A preferência não possui external_reference válido.",
          },
    });
  } catch (error) {
    console.error("Mercado Pago debug preference failed", {
      message: error instanceof Error ? error.message : "Erro desconhecido",
      status:
        typeof error === "object" && error !== null && "status" in error
          ? error.status
          : undefined,
    });

    return NextResponse.json(
      {
        error: "Não foi possível consultar os dados do Mercado Pago.",
        message: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    );
  }
}
