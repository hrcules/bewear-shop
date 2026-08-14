import type { Metadata } from "next";
import ReactQueryProvider from "@/providers/react-query";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm"; // ✅ Importação para a consulta do Drizzle

import NotificationBell from "@/components/common/notification-bell";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { getTenantStore } from "@/lib/tentat";
import { db } from "@/db"; // ✅ Importação do banco de dados
import { storeTable } from "@/db/schema"; // ✅ Importação da tabela da loja

import { MobileSidebar } from "./components/mobile-sidebar";
import { AcceptTermsDialog } from "./components/accept-terms-dialog";

export const metadata: Metadata = {
  title: "admin",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/authentication");
  }

  const store = await getTenantStore();

  if (!store) {
    redirect("/");
  }

  if (store.ownerId !== session.user.id) {
    console.warn(
      `Tentativa de invasão bloqueada! User: ${session.user.id} tentou acessar a loja: ${store.id}`,
    );
    redirect("/");
  }

  // ✅ A SERVER ACTION: Função que roda apenas no backend para salvar o aceite
  async function handleAcceptTerms(storeId: string) {
    "use server"; // Isso transforma a função em uma Server Action

    await db
      .update(storeTable)
      .set({ termsAcceptedAt: new Date() })
      .where(eq(storeTable.id, storeId));
  }

  // ✅ A TRAVA: Verifica se a loja ainda não aceitou os termos
  const needsToAcceptTerms = !store.termsAcceptedAt;

  const colorPrimary = store.colorPrimary || "#8B5CF6";

  return (
    <ReactQueryProvider>
      {/* ✅ SE PRECISAR ACEITAR: Renderiza o Modal por cima de toda a interface */}
      {needsToAcceptTerms && (
        <AcceptTermsDialog
          storeId={store.id}
          acceptAction={handleAcceptTerms}
        />
      )}

      <div
        className="flex min-h-screen flex-col md:flex-row"
        style={
          {
            "--primary": colorPrimary,
            "--ring": colorPrimary,
          } as React.CSSProperties
        }
      >
        {/* === HEADER MOBILE (Visível apenas em telas pequenas) === */}
        <header className="flex h-16 items-center justify-between border-b px-4 md:hidden">
          <div className="flex items-center gap-2">
            <MobileSidebar storeName={store.name} colorPrimary={colorPrimary} />
          </div>
          <NotificationBell />
        </header>

        {/* === SIDEBAR DESKTOP (Visível apenas em md ou maior) === */}
        <aside className="bg-muted/20 hidden w-64 shrink-0 flex-col border-r p-6 md:flex">
          <div className="mb-8 flex items-center justify-between">
            <div className="text-primary text-xl font-bold">
              <p className="text-accent-foreground text-sm font-semibold">
                área restrita
              </p>
              {store.name}
            </div>
            <NotificationBell />
          </div>
          <nav className="space-y-2">
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-primary w-full justify-start"
              asChild
            >
              <Link href="/admin/">Dashboard</Link>
            </Button>
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-primary w-full justify-start"
              asChild
            >
              <Link href="/admin/products">Produtos</Link>
            </Button>
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-primary w-full justify-start"
              asChild
            >
              <Link href="/admin/categories">Categorias</Link>
            </Button>
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-primary w-full justify-start"
              asChild
            >
              <Link href="/admin/orders">Pedidos</Link>
            </Button>
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-primary w-full justify-start"
              asChild
            >
              <Link href="/admin/settings">Configurações</Link>
            </Button>
          </nav>
        </aside>

        {/* === CONTEÚDO PRINCIPAL === */}
        {/* Ajustei o padding no mobile para não ficar tão esmagado */}
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </ReactQueryProvider>
  );
}
