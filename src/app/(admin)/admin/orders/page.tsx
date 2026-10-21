import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  mpCheckoutTable,
  orderTable,
  storeTable,
  shippingAddressTable,
  orderItemTable,
  productVariantTable,
  productTable,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { formatCentsToBRL } from "@/helpers/money";
import {
  paymentMethodLabel,
  paymentStatusLabel,
} from "@/helpers/payment-method";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrderStatusSelector } from "./components/order-status-selector";
import OrdersFilter from "./components/orders-filter";

type OrderWithDetails = typeof orderTable.$inferSelect & {
  shippingAddress: typeof shippingAddressTable.$inferSelect | null;
  items: (typeof orderItemTable.$inferSelect & {
    productVariant: typeof productVariantTable.$inferSelect & {
      product: typeof productTable.$inferSelect;
    };
  })[];
};

type PaymentInfo = typeof mpCheckoutTable.$inferSelect;

function PaymentDetails({ payment }: { payment: PaymentInfo }) {
  const method = paymentMethodLabel(
    payment.paymentTypeId,
    payment.paymentMethodId,
    payment.installments,
  );
  const status = paymentStatusLabel(payment.lastPaymentStatus);
  const paidAt = payment.paidAt
    ? payment.paidAt.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-3 border-t pt-4">
      <h4 className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">
        Pagamento (Mercado Pago)
      </h4>
      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Meio de pagamento</dt>
          <dd className="font-medium">{method ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">ID do pagamento</dt>
          <dd className="font-mono font-medium break-all">
            {payment.paymentId ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {paidAt ? "Pago em" : "Situação do pagamento"}
          </dt>
          <dd className="font-medium">{paidAt ?? status ?? "—"}</dd>
        </div>
      </dl>
      {payment.reviewReason && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Precisa de revisão: {payment.reviewReason} Confira o pagamento no
          painel do Mercado Pago antes de enviar o pedido.
        </p>
      )}
    </div>
  );
}

interface AdminOrdersPageProps {
  searchParams: Promise<{
    start?: string;
    end?: string;
    status?: string;
  }>;
}

function OrdersList({
  orders,
  emptyMessage,
  payments,
}: {
  orders: OrderWithDetails[];
  emptyMessage: string;
  payments: Record<string, PaymentInfo>;
}) {
  if (orders.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">{emptyMessage}</p>
    );
  }

  return (
    <div className="space-y-6">
      {orders.map((order) => {
        const subtotalInCents = order.items.reduce(
          (acc, item) => acc + item.priceInCents * item.quantity,
          0,
        );
        const freteInCents = order.totalPriceInCents - subtotalInCents;

        return (
          <div
            key={order.id}
            className="bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-sm"
          >
            <div className="flex flex-col items-start justify-between gap-4 border-b pb-4 md:flex-row md:items-center">
              <div>
                <div className="mb-1 flex items-center gap-3">
                  <p className="text-lg font-bold">#{order.orderNumber}</p>
                  <OrderStatusSelector
                    orderId={order.id}
                    currentStatus={order.status}
                  />
                </div>
                <p className="text-muted-foreground text-sm">
                  {new Date(order.createdAt).toLocaleDateString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <div className="flex flex-col md:items-end">
                <p className="text-primary text-2xl font-bold">
                  {formatCentsToBRL(order.totalPriceInCents)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8 pt-2 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">
                  Dados de Envio
                </h4>
                {order.shippingAddress ? (
                  <div className="space-y-1 text-sm">
                    <p className="text-base font-medium">
                      {order.shippingAddress.fullName}
                    </p>
                    <p>
                      Email:{" "}
                      <span className="text-muted-foreground">
                        {order.shippingAddress.email}
                      </span>
                    </p>
                    <p>
                      Telefone:{" "}
                      <span className="text-muted-foreground">
                        {order.shippingAddress.phone}
                      </span>
                    </p>
                    <p className="text-muted-foreground pt-2">
                      {order.shippingAddress.address},{" "}
                      {order.shippingAddress.number}
                      {order.shippingAddress.complement &&
                        ` - ${order.shippingAddress.complement}`}
                      <br />
                      {order.shippingAddress.city} -{" "}
                      {order.shippingAddress.state} | CEP:{" "}
                      {order.shippingAddress.zipCode}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Endereço não encontrado.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">
                  Itens do Pedido ({order.items.length})
                </h4>
                <ul className="space-y-3">
                  {order.items.map((item) => (
                    <li
                      key={item.id}
                      className="bg-muted/30 flex items-start justify-between rounded-md p-2 text-sm"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {item.quantity}x {item.productVariant.product.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          Variação: {item.productVariant.name}
                        </span>
                      </div>
                      <span className="font-medium">
                        {formatCentsToBRL(item.priceInCents * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex flex-col items-end space-y-1 border-t pt-3 text-sm">
                  <div className="text-muted-foreground flex w-full justify-between sm:w-48">
                    <span>Subtotal:</span>
                    <span>{formatCentsToBRL(subtotalInCents)}</span>
                  </div>
                  <div className="text-muted-foreground flex w-full justify-between sm:w-48">
                    <span>Frete:</span>
                    <span>{formatCentsToBRL(freteInCents)}</span>
                  </div>
                  <div className="mt-1 flex w-full justify-between border-t pt-1 text-base font-bold sm:w-48">
                    <span>Total:</span>
                    <span className="text-primary">
                      {formatCentsToBRL(order.totalPriceInCents)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {payments[order.id] && <PaymentDetails payment={payments[order.id]} />}
          </div>
        );
      })}
    </div>
  );
}

export default async function AdminOrdersPage({
  searchParams,
}: AdminOrdersPageProps) {
  const { start, end, status } = await searchParams;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/authentication");

  const store = await db.query.storeTable.findFirst({
    where: eq(storeTable.ownerId, session.user.id),
  });
  if (!store) redirect("/");

  const conditions = [eq(orderTable.storeId, store.id)];

  if (start) {
    const startDate = new Date(`${start}T00:00:00`);
    conditions.push(gte(orderTable.createdAt, startDate));
  }
  if (end) {
    const endDate = new Date(`${end}T23:59:59.999`);
    conditions.push(lte(orderTable.createdAt, endDate));
  }
  if (status && status !== "all") {
    conditions.push(eq(orderTable.status, status));
  }

  const allOrders = await db.query.orderTable.findMany({
    where: and(...conditions),
    orderBy: [desc(orderTable.createdAt)],
    with: {
      shippingAddress: true,
      items: {
        with: { productVariant: { with: { product: true } } },
      },
    },
  });

  // Dados do pagamento no Mercado Pago (só existem em pedidos pagos online).
  const checkouts = allOrders.length
    ? await db
        .select()
        .from(mpCheckoutTable)
        .where(
          inArray(
            mpCheckoutTable.orderId,
            allOrders.map((order) => order.id),
          ),
        )
    : [];
  const payments = Object.fromEntries(
    checkouts.map((checkout) => [checkout.orderId, checkout]),
  );

  const validOrders = allOrders.filter(
    (order) =>
      order.status !== "pending" &&
      order.status !== "cancelled" &&
      order.status !== "refunded",
  );
  const pendingOrders = allOrders.filter((order) => order.status === "pending");
  const cancelledOrders = allOrders.filter(
    (order) => order.status === "cancelled" || order.status === "refunded",
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Pedidos</h2>
        <p className="text-muted-foreground">
          Gerencie as vendas e intenções de compra da sua loja.
        </p>
      </div>

      <OrdersFilter />

      <Tabs defaultValue="valid" className="w-full">
        <TabsList
          variant="line"
          className="h-auto w-full flex-wrap justify-start gap-x-2 gap-y-1 md:w-fit"
        >
          <TabsTrigger value="valid" className="h-9 flex-none px-4">
            Confirmados ({validOrders.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="h-9 flex-none px-4">
            {store.enableOnlinePayments
              ? "Carrinhos Abandonados"
              : "Aguardando Pagto"}{" "}
            ({pendingOrders.length})
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="h-9 flex-none px-4">
            Cancelados/Reembolsados ({cancelledOrders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="valid">
          <Card>
            <CardHeader>
              <CardTitle>Vendas Confirmadas</CardTitle>
              <CardDescription>
                Pedidos que já foram pagos e estão prontos para envio.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OrdersList
                orders={validOrders}
                emptyMessage="Nenhuma venda confirmada neste período."
                payments={payments}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>
                {store.enableOnlinePayments
                  ? "Carrinhos Abandonados"
                  : "Aguardando Pagamento"}
              </CardTitle>
              <CardDescription>
                {store.enableOnlinePayments
                  ? "Clientes que geraram a intenção mas não finalizaram o pagamento. Ótima oportunidade de remarketing!"
                  : "Pedidos realizados pelo catálogo que estão aguardando o envio do comprovante pelo cliente."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OrdersList
                orders={pendingOrders}
                emptyMessage="Nenhum pedido pendente."
                payments={payments}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cancelled">
          <Card>
            <CardHeader>
              <CardTitle>Pedidos Cancelados</CardTitle>
              <CardDescription>
                Pedidos cancelados e com estoque estornado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OrdersList
                orders={cancelledOrders}
                emptyMessage="Nenhum pedido cancelado."
                payments={payments}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
