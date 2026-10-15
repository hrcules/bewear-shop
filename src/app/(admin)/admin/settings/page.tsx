import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { mpConnectionTable, storeTable } from "@/db/schema";
import { auth } from "@/lib/auth";

import { mpEnabled } from "@/lib/mercadopago/config";

import { MercadoPagoPanel } from "./components/mercadopago-panel";
import { SettingsForm } from "./components/settings-form";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ mp?: string }>;
}) {
  const { mp } = await searchParams;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/authentication");
  }

  const store = await db.query.storeTable.findFirst({
    where: eq(storeTable.ownerId, session.user.id),
  });

  if (!store) {
    redirect("/");
  }

  const connection = await db.query.mpConnectionTable.findFirst({
    where: eq(mpConnectionTable.storeId, store.id),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          Configurações da Loja
        </h2>
        <p className="text-muted-foreground">
          Gerencie a identidade visual e os contatos da sua vitrine.
        </p>
      </div>

      <SettingsForm initialData={store} />

      <MercadoPagoPanel
        available={mpEnabled()}
        sellerId={connection?.sellerId ?? null}
        status={connection?.status ?? null}
        result={mp}
        active={store.checkoutProvider === "mercadopago"}
      />
    </div>
  );
}
