import { and, eq, isNotNull, or } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { mpConnectionTable, mpCheckoutTable, orderTable } from "@/db/schema";
import { auth } from "@/lib/auth";

import { mpEnabled } from "@/lib/mercadopago/config";
import { getTenantStore } from "@/lib/tentat";
import { PaymentReview } from "./components/payment-review";
import { MercadoPagoPanel } from "./components/mercadopago-panel";

import { SettingsForm } from "./components/settings-form";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ mp?: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/authentication");
  }

  const store = await getTenantStore();

  if (!store || store.ownerId !== session.user.id) {
    redirect("/");
  }

  const connection = await db.query.mpConnectionTable.findFirst({
    where: eq(mpConnectionTable.storeId, store.id),
    columns: { sellerId: true, status: true },
  });
  const reviews = await db
    .select({ id: mpCheckoutTable.orderId })
    .from(mpCheckoutTable)
    .where(
      and(
        eq(mpCheckoutTable.storeId, store.id),
        isNotNull(mpCheckoutTable.reviewReason),
      ),
    );
  const paymentReviews = await db
    .select({
      id: orderTable.id,
      number: orderTable.orderNumber,
      status: orderTable.status,
    })
    .from(mpCheckoutTable)
    .innerJoin(orderTable, eq(orderTable.id, mpCheckoutTable.orderId))
    .where(
      and(
        eq(mpCheckoutTable.storeId, store.id),
        or(
          eq(orderTable.status, "pending"),
          isNotNull(mpCheckoutTable.reviewReason),
        ),
      ),
    )
    .limit(50);
  const { mp } = await searchParams;

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

      <MercadoPagoPanel
        available={mpEnabled()}
        enabled={store.checkoutProvider === "mercadopago"}
        sellerId={connection?.sellerId ?? null}
        status={connection?.status ?? null}
        result={mp}
        reviews={reviews.length}
      />
      <PaymentReview orders={paymentReviews} />
      <SettingsForm
        initialData={{
          ...store,
          stripeSecretKey: null,
          stripeWebhookSecret: null,
          mpAccessToken: null,
        }}
      />
    </div>
  );
}
