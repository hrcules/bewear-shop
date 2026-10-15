import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { orderTable } from "@/db/schema";
import Header from "@/components/common/header/index";
import { auth } from "@/lib/auth";
import { getTenantStore } from "@/lib/tentat";

import CheckoutSuccessDialog from "./components/checkout-success-dialog";

interface CheckoutSuccessPageProps {
  searchParams: Promise<{
    orderId?: string;
  }>;
}

const CheckoutSuccessPage = async ({
  searchParams,
}: CheckoutSuccessPageProps) => {
  const { orderId } = await searchParams;

  if (!orderId) {
    redirect("/");
  }

  // O pedido só pode ser visto pelo cliente que o fez, na loja em que foi feito.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user.id) {
    redirect("/login");
  }

  const tenantStore = await getTenantStore();
  if (!tenantStore) {
    redirect("/");
  }

  const order = await db.query.orderTable.findFirst({
    where: eq(orderTable.id, orderId),
    with: {
      store: true,
    },
  });
  if (
    !order ||
    order.userId !== session.user.id ||
    order.storeId !== tenantStore.id
  ) {
    redirect("/");
  }

  return (
    <>
      <Header />
      <CheckoutSuccessDialog
        enableOnlinePayments={order.store.enableOnlinePayments ?? true}
        storePhone={order.store.whatsapp}
        storeName={order.store.name}
        orderNumber={order.orderNumber}
        orderTotalInCents={order.totalPriceInCents}
        paymentPending={
          order.status === "pending" && order.paymentProvider === "mercadopago"
        }
      />
    </>
  );
};

export default CheckoutSuccessPage;
