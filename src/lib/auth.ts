import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/db";
import * as schema from "@/db/schema";

const baseURL = process.env.NEXT_PUBLIC_APP_URL || "http://lvh.me:3000";

function getCookieDomain(url: string) {
  const hostname = new URL(url).hostname;

  // Staging precisa vir antes de produção,
  // pois também termina com ".bewearshop.com.br".
  if (
    hostname === "staging.bewearshop.com.br" ||
    hostname.endsWith(".staging.bewearshop.com.br")
  ) {
    return ".staging.bewearshop.com.br";
  }

  if (
    hostname === "bewearshop.com.br" ||
    hostname.endsWith(".bewearshop.com.br")
  ) {
    return ".bewearshop.com.br";
  }

  if (hostname === "lvh.me" || hostname.endsWith(".lvh.me")) {
    return ".lvh.me";
  }

  return undefined;
}

const cookieDomain = getCookieDomain(baseURL);

export const auth = betterAuth({
  // A matriz muda de acordo com o ambiente:
  //
  // Local:
  // http://lvh.me:3000
  //
  // Staging:
  // https://staging.bewearshop.com.br
  //
  // Produção:
  // https://bewearshop.com.br
  baseURL,

  emailAndPassword: {
    enabled: true,

    sendResetPassword: async ({ user, url }) => {
      console.log(`🔗 [DEBUG] URL de Recuperação para ${user.email}:`, url);

      // Futuramente:
      // await sendPasswordResetEmail(user.email, url);
    },
  },

  socialProviders: {
    google: {
      prompt: "select_account",
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  advanced: {
    crossSubDomainCookies: {
      enabled: true,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    },

    defaultCookieAttributes: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },

  trustedOrigins: [
    "https://bewearshop.com.br",
    "https://www.bewearshop.com.br",
    "https://*.bewearshop.com.br",

    "https://staging.bewearshop.com.br",
    "https://*.staging.bewearshop.com.br",

    // workaround Better Auth 1.2.12
    "https://bewear.staging.bewearshop.com.br",

    "http://lvh.me:3000",
    "http://*.lvh.me:3000",
  ],

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
