import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import Header from "@/components/common/header/index";
import { db } from "@/db";
import { auth } from "@/lib/auth";

import Orders from "./components/orders";
import { getTenantStore } from "@/lib/tentat";

const MyOrdersPage = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user.id) {
    redirect("/login");
  }

  const store = await getTenantStore();

  if (!store) {
    redirect("/");
  }

  const orders = await db.query.orderTable.findMany({
    where: (order, { eq, and }) =>
      and(eq(order.userId, session.user.id), eq(order.storeId, store.id)),
    orderBy: (order, { desc }) => desc(order.createdAt),
    with: {
      items: {
        with: {
          productVariant: {
            with: {
              product: true,
            },
          },
        },
      },
    },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 space-y-8 pt-6 pb-12">
        <div className="mx-auto w-full max-w-7xl px-5 md:px-10">
          <h1 className="mb-6 text-2xl font-bold">Meus Pedidos</h1>{" "}
          <Orders
            orders={orders.map((order) => ({
              id: order.id,
              totalPriceInCents: order.totalPriceInCents,
              orderNumber: order.orderNumber,
              status: order.status,
              createdAt: order.createdAt,
              paymentProvider: order.paymentProvider,
              items: order.items.map((item) => ({
                id: item.id,
                imageUrl: item.productVariant.imageUrl,
                productName: item.productVariant.product.name,
                productVariantName: item.productVariant.name,
                priceInCents: item.productVariant.priceInCents,
                quantity: item.quantity,
              })),
            }))}
          />
        </div>
      </main>
    </div>
  );
};

export default MyOrdersPage;
