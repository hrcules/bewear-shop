import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { storeTable } from "@/db/schema";
import { auth } from "@/lib/auth";

import { SettingsForm } from "./components/settings-form";

export default async function SettingsPage() {
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
    </div>
  );
}
