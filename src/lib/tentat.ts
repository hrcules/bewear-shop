import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { storeTable } from "@/db/schema";

export const getTenantStore = async () => {
  const reqHeaders = await headers();
  const host = reqHeaders.get("host") || "";

  const subdomain = host.split(".")[0];

  const store = await db.query.storeTable.findFirst({
    where: eq(storeTable.slug, subdomain),
  });

  return store;
};
