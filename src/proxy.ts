import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/((?!api/stripe|_next/|_static/|[\\w-]+\\.\\w+).*)"],
};

export default async function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const path = url.pathname;

  // Origem real da requisição.
  // Ex:
  // https://mhbrand.bewearshop.com.br
  // https://mhbrand.staging.bewearshop.com.br
  // http://mhbrand.lvh.me:3000
  const origin = req.headers.get("origin") || "";

  // ============================================================
  // 1. CORS PREFLIGHT - BETTER AUTH
  // ============================================================

  if (path.startsWith("/api/auth") && req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }

  const hostname = req.headers.get("host") || "";

  // ============================================================
  // 2. REMOVER WWW DE SUBDOMÍNIOS
  // ============================================================

  /*
   * Exemplos:
   *
   * www.mhbrand.bewearshop.com.br
   *              ↓
   * mhbrand.bewearshop.com.br
   *
   * www.mhbrand.staging.bewearshop.com.br
   *              ↓
   * mhbrand.staging.bewearshop.com.br
   *
   * Mantemos www.bewearshop.com.br intacto caso ele seja utilizado.
   */

  if (hostname.startsWith("www.") && hostname !== "www.bewearshop.com.br") {
    const cleanHostname = hostname.replace(/^www\./, "");
    const cleanUrl = new URL(req.url);

    cleanUrl.host = cleanHostname;

    return NextResponse.redirect(cleanUrl);
  }

  // ============================================================
  // 3. DOMÍNIOS RAIZ DA APLICAÇÃO
  // ============================================================

  /*
   * Esses hosts NÃO representam lojas.
   *
   * Qualquer outro host será analisado como possível subdomínio
   * de uma loja.
   */

  const rootDomains = [
    // Desenvolvimento
    "localhost:3000",
    "lvh.me:3000",

    // Produção
    "bewearshop.com.br",
    "www.bewearshop.com.br",

    // Staging
    "staging.bewearshop.com.br",

    // Vercel
    "usebewear.vercel.app",
  ];

  /*
   * Exemplos:
   *
   * bewearshop.com.br
   * → ""
   *
   * staging.bewearshop.com.br
   * → ""
   *
   * mhbrand.bewearshop.com.br
   * → "mhbrand"
   *
   * mhbrand.staging.bewearshop.com.br
   * → "mhbrand"
   *
   * mhbrand.lvh.me:3000
   * → "mhbrand"
   */

  const subdomain = rootDomains.includes(hostname)
    ? ""
    : hostname.split(".")[0];

  // ============================================================
  // 4. ROTAS INTERNAS DA APLICAÇÃO
  // ============================================================

  /*
   * Essas rotas não devem ser reescritas para /store/:slug.
   *
   * Isso também garante que:
   *
   * /api/mercadopago/oauth/callback
   *
   * passe normalmente pelo Next.js.
   */

  const isAppRoute =
    path.startsWith("/authentication") ||
    path.startsWith("/admin") ||
    path.startsWith("/super-admin") ||
    path.startsWith("/api");

  // ============================================================
  // 5. HEADERS DA REQUISIÇÃO
  // ============================================================

  const requestHeaders = new Headers(req.headers);

  // ============================================================
  // 6. NORMALIZAÇÃO DA ORIGEM PARA O BETTER AUTH
  // ============================================================

  /*
   * O Better Auth precisa enxergar a origem da aplicação matriz.
   *
   * Produção:
   *
   * mhbrand.bewearshop.com.br
   *              ↓
   * bewearshop.com.br
   *
   * Staging:
   *
   * mhbrand.staging.bewearshop.com.br
   *              ↓
   * staging.bewearshop.com.br
   *
   * Desenvolvimento:
   *
   * mhbrand.lvh.me:3000
   *              ↓
   * lvh.me:3000
   */

  if (path.startsWith("/api/auth") && origin) {
    // IMPORTANTE:
    // staging precisa ser verificado ANTES de .bewearshop.com.br,
    // porque também termina com ".bewearshop.com.br".

    if (origin.endsWith(".staging.bewearshop.com.br")) {
      requestHeaders.set("origin", "https://staging.bewearshop.com.br");
    } else if (origin === "https://staging.bewearshop.com.br") {
      requestHeaders.set("origin", "https://staging.bewearshop.com.br");
    } else if (origin.endsWith(".bewearshop.com.br")) {
      requestHeaders.set("origin", "https://bewearshop.com.br");
    } else if (
      origin === "https://bewearshop.com.br" ||
      origin === "https://www.bewearshop.com.br"
    ) {
      requestHeaders.set("origin", "https://bewearshop.com.br");
    } else if (origin.endsWith(".lvh.me:3000")) {
      requestHeaders.set("origin", "http://lvh.me:3000");
    } else if (origin === "http://lvh.me:3000") {
      requestHeaders.set("origin", "http://lvh.me:3000");
    }
  }

  // ============================================================
  // 7. REWRITE MULTI-TENANT
  // ============================================================

  let response: NextResponse;

  /*
   * Rotas internas continuam normalmente.
   *
   * Também evitamos reescrever uma URL que já esteja dentro
   * de /store.
   */

  if (isAppRoute || path.startsWith("/store")) {
    response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } else if (subdomain && subdomain !== "www") {

  /*
   * Se houver subdomínio, tratamos como slug de loja.
   *
   * Exemplos:
   *
   * mhbrand.bewearshop.com.br/produtos
   *
   * internamente vira:
   *
   * /store/mhbrand/produtos
   *
   *
   * E no staging:
   *
   * mhbrand.staging.bewearshop.com.br/produtos
   *
   * também vira:
   *
   * /store/mhbrand/produtos
   */
    const searchParams = url.searchParams.toString();

    const fullPath = `${path}${
      searchParams.length > 0 ? `?${searchParams}` : ""
    }`;

    response = NextResponse.rewrite(
      new URL(`/store/${subdomain}${fullPath}`, req.url),
      {
        request: {
          headers: requestHeaders,
        },
      },
    );
  } else {

  /*
   * Domínio matriz.
   */
    response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // ============================================================
  // 8. CORS RESPONSE FINAL - BETTER AUTH
  // ============================================================

  /*
   * Internamente alteramos a origem para o Better Auth,
   * mas devolvemos ao navegador a origem real de onde veio
   * a requisição.
   */

  if (path.startsWith("/api/auth") && origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  return response;
}
