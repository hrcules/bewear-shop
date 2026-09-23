import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/db";
import * as schema from "@/db/schema";

const baseURL = process.env.NEXT_PUBLIC_APP_URL || "http://lvh.me:3000";

const hostname = new URL(baseURL).hostname;

// ============================================================
// IDENTIFICAÇÃO DO AMBIENTE
// ============================================================

const isStaging =
  hostname === "staging.bewearshop.com.br" ||
  hostname.endsWith(".staging.bewearshop.com.br");

const isLocal =
  hostname === "lvh.me" ||
  hostname.endsWith(".lvh.me") ||
  hostname === "localhost";

const isProduction =
  hostname === "bewearshop.com.br" || hostname.endsWith(".bewearshop.com.br");

// ============================================================
// DOMÍNIO DOS COOKIES
// ============================================================

function getCookieDomain() {
  // IMPORTANTE:
  // staging precisa vir antes de produção,
  // porque staging também termina em ".bewearshop.com.br".
  if (isStaging) {
    return ".staging.bewearshop.com.br";
  }

  if (isProduction) {
    return ".bewearshop.com.br";
  }

  if (isLocal) {
    return ".lvh.me";
  }

  return undefined;
}

const cookieDomain = getCookieDomain();

// ============================================================
// PREFIXO DOS COOKIES
// ============================================================

/*
 * Isso impede conflito entre:
 *
 * Produção:
 * __Secure-better-auth.session_token
 *
 * Staging:
 * __Secure-bewear-staging.session_token
 *
 * Local:
 * bewear-local.session_token
 *
 * O staging está dentro de .bewearshop.com.br,
 * então sem prefixos diferentes o navegador pode enviar
 * dois session_token com o mesmo nome.
 */
const cookiePrefix = isStaging
  ? "bewear-staging"
  : isLocal
    ? "bewear-local"
    : "better-auth";

export const auth = betterAuth({
  // ==========================================================
  // URL BASE
  // ==========================================================

  /*
   * Local:
   * http://lvh.me:3000
   *
   * Staging:
   * https://staging.bewearshop.com.br
   *
   * Produção:
   * https://bewearshop.com.br
   */
  baseURL,

  // ==========================================================
  // EMAIL / SENHA
  // ==========================================================

  emailAndPassword: {
    enabled: true,

    sendResetPassword: async ({ user, url }) => {
      console.log(`🔗 [DEBUG] URL de Recuperação para ${user.email}:`, url);

      // Futuramente:
      // await sendPasswordResetEmail(user.email, url);
    },
  },

  // ==========================================================
  // GOOGLE
  // ==========================================================

  socialProviders: {
    google: {
      prompt: "select_account",
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  // ==========================================================
  // COOKIES / SUBDOMÍNIOS
  // ==========================================================

  advanced: {
    /*
     * Evita que staging e produção utilizem cookies
     * com exatamente o mesmo nome.
     */
    cookiePrefix,

    /*
     * HTTPS em staging/produção.
     * Local continua funcionando via HTTP.
     */
    useSecureCookies: !isLocal,

    /*
     * Permite compartilhar autenticação entre:
     *
     * staging.bewearshop.com.br
     * bewear.staging.bewearshop.com.br
     * outra-loja.staging.bewearshop.com.br
     *
     * sem compartilhar com produção.
     */
    crossSubDomainCookies: {
      enabled: true,
      ...(cookieDomain
        ? {
            domain: cookieDomain,
          }
        : {}),
    },

    defaultCookieAttributes: {
      httpOnly: true,
      path: "/",

      /*
       * Os subdomínios continuam sendo same-site.
       * Lax é suficiente para nosso fluxo OAuth e
       * evita abrir desnecessariamente para SameSite=None.
       */
      sameSite: "lax",

      secure: !isLocal,
    },
  },

  // ==========================================================
  // ORIGENS CONFIÁVEIS
  // ==========================================================

  trustedOrigins: [
    // --------------------------
    // PRODUÇÃO
    // --------------------------

    "https://bewearshop.com.br",
    "https://www.bewearshop.com.br",
    "https://*.bewearshop.com.br",

    // --------------------------
    // STAGING
    // --------------------------

    "https://staging.bewearshop.com.br",
    "https://*.staging.bewearshop.com.br",

    /*
     * Workaround para Better Auth 1.2.12,
     * já que o wildcard não aceitou corretamente
     * o callbackURL dessa loja no nosso teste.
     */
    "https://bewear.staging.bewearshop.com.br",

    // --------------------------
    // LOCAL
    // --------------------------

    "http://lvh.me:3000",
    "http://*.lvh.me:3000",
  ],

  // ==========================================================
  // DATABASE
  // ==========================================================

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),

  user: {
    modelName: "user",
  },

  session: {
    modelName: "session",
  },

  account: {
    modelName: "account",
  },

  verification: {
    modelName: "verification",
  },
});
