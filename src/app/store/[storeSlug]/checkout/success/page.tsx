import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { orderTable } from "@/db/schema";
import Header from "@/components/common/header/index";

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

  const order = await db.query.orderTable.findFirst({
    where: eq(orderTable.id, orderId),
    with: {
      store: true,
    },
  });
  if (!order) {
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
