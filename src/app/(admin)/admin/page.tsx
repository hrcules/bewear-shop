import { and, desc, eq, gte, lte, notInArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  CreditCard,
  DollarSign,
  Package,
  Receipt,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { db } from "@/db";
import {
  announcementTable,
  mpConnectionTable,
  orderTable,
  productTable,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { formatCentsToBRL } from "@/helpers/money";
import { translateOrderStatus } from "@/helpers/orders-status";
import { buildSalesSeries, resolvePeriod } from "@/lib/dashboard-period";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import DashboardFilter from "./components/dashboard-filter";
import SalesChart from "./components/sales-chart";
import { getTenantStore } from "@/lib/tentat";
import { ChangelogAlert } from "./components/changelog-alert";

const EXCLUDED_STATUSES = ["pending", "canceled", "cancelled", "refunded"];
const LOW_STOCK_LIMIT = 5;

const STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  paid: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  processing:
    "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  shipped:
    "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  delivered:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  canceled: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  refunded: "bg-muted text-muted-foreground",
};

interface AdminDashboardPageProps {
  searchParams: Promise<{
    start?: string;
    end?: string;
    period?: string;
  }>;
}

function Trend({
  current,
  previous,
}: {
  current: number;
  previous: number | null;
}) {
  if (previous === null) return null;

  if (previous === 0) {
    return current > 0 ? (
      <span className="text-xs font-medium text-emerald-600">
        Novo no período
      </span>
    ) : null;
  }

  const change = ((current - previous) / previous) * 100;
  const up = change >= 0;
  const Icon = up ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        up ? "text-emerald-600" : "text-red-600",
      )}
    >
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}
      {Math.round(change)}%
      <span className="text-muted-foreground ml-1 font-normal">
        vs. período anterior
      </span>
    </span>
  );
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  href,
  highlight = false,
  danger = false,
  className,
}: {
  title: string;
  value: React.ReactNode;
  description?: string;
  icon: LucideIcon;
  trend?: React.ReactNode;
  href?: string;
  highlight?: boolean;
  danger?: boolean;
  className?: string;
}) {
  const card = (
    <Card
      className={cn(
        "h-full",
        highlight && "border-primary/40 bg-primary/5",
        href && "hover:bg-muted/40 transition-colors",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-xs leading-tight font-medium sm:text-sm">
          {title}
        </CardTitle>
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            danger ? "text-red-500" : "text-muted-foreground",
          )}
        />
      </CardHeader>
      <CardContent>
        <div className="truncate text-xl font-bold sm:text-2xl">{value}</div>
        {trend && <div className="mt-1">{trend}</div>}
        {description && (
          <p className="text-muted-foreground mt-1 text-xs">{description}</p>
        )}
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className={cn("block", className)}>
      {card}
    </Link>
  ) : (
    card
  );
}

export default async function AdminDashboardPage({
  searchParams,
}: AdminDashboardPageProps) {
  const { start, end, period: periodParam } = await searchParams;

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

  const now = new Date();
  const period = resolvePeriod({ start, end, period: periodParam }, now);

  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() - 3);

  const activeAnnouncements = await db.query.announcementTable.findMany({
    where: and(
      eq(announcementTable.isActive, true),
      gte(announcementTable.createdAt, expirationDate),
    ),
    orderBy: [desc(announcementTable.createdAt)],
    limit: 1,
  });

  const orderConditions = [eq(orderTable.storeId, store.id)];
  if (period.start) {
    orderConditions.push(gte(orderTable.createdAt, period.start));
  }
  if (period.end) {
    orderConditions.push(lte(orderTable.createdAt, period.end));
  }

  const orders = await db.query.orderTable.findMany({
    where: and(...orderConditions),
    with: {
      items: {
        with: {
          productVariant: {
            with: { product: true },
          },
        },
      },
    },
  });

  const storeProducts = await db.query.productTable.findMany({
    where: eq(productTable.storeId, store.id),
    with: { variants: true },
  });

  // Contagem de pedidos por status em toda a vida da loja (itens de ação).
  const statusRows = await db
    .select({
      status: orderTable.status,
      total: sql<number>`count(*)`,
    })
    .from(orderTable)
    .where(eq(orderTable.storeId, store.id))
    .groupBy(orderTable.status);

  const countStatuses = (statuses: string[]) =>
    statusRows
      .filter((row) => statuses.includes(row.status))
      .reduce((acc, row) => acc + Number(row.total), 0);

  const ordersToShip = countStatuses(["paid", "processing"]);
  const ordersAwaitingPayment = countStatuses(["pending"]);
  const salesEver =
    statusRows.reduce((acc, row) => acc + Number(row.total), 0) -
    countStatuses(EXCLUDED_STATUSES);

  // Período anterior de mesmo tamanho, para a variação dos números.
  let previous: { revenue: number; orders: number } | null = null;
  if (period.previous) {
    const [row] = await db
      .select({
        revenue: sql<number>`coalesce(sum(${orderTable.totalPriceInCents}), 0)`,
        orders: sql<number>`count(*)`,
      })
      .from(orderTable)
      .where(
        and(
          eq(orderTable.storeId, store.id),
          gte(orderTable.createdAt, period.previous.start),
          lte(orderTable.createdAt, period.previous.end),
          notInArray(orderTable.status, EXCLUDED_STATUSES),
        ),
      );

    previous = {
      revenue: Number(row?.revenue ?? 0),
      orders: Number(row?.orders ?? 0),
    };
  }

  const recentOrders = await db.query.orderTable.findMany({
    where: eq(orderTable.storeId, store.id),
    orderBy: [desc(orderTable.createdAt)],
    limit: 5,
    with: { shippingAddress: true },
  });

  const [mpConnection] = store.enableOnlinePayments
    ? await db
        .select({ status: mpConnectionTable.status })
        .from(mpConnectionTable)
        .where(eq(mpConnectionTable.storeId, store.id))
        .limit(1)
    : [];

  const mpConnected = mpConnection?.status === "connected";
  const mpNeedsReconnect = mpConnection?.status === "reconnect";

  const successfulOrders = orders.filter(
    (order) => !EXCLUDED_STATUSES.includes(order.status),
  );
  const totalRevenueInCents = successfulOrders.reduce(
    (acc, order) => acc + order.totalPriceInCents,
    0,
  );
  const totalOrdersCount = successfulOrders.length;
  const averageTicketInCents =
    totalOrdersCount > 0
      ? Math.round(totalRevenueInCents / totalOrdersCount)
      : 0;
  const totalProductsCount = storeProducts.length;

  const salesSeries = buildSalesSeries(successfulOrders, period, now);

  const itemsMap = new Map<
    string,
    { id: string; name: string; variant: string; qty: number; revenue: number }
  >();

  successfulOrders.forEach((order) => {
    order.items.forEach((item) => {
      const key = item.productVariant.id;
      if (!itemsMap.has(key)) {
        itemsMap.set(key, {
          id: key,
          name: item.productVariant.product.name,
          variant: item.productVariant.name,
          qty: 0,
          revenue: 0,
        });
      }
      const current = itemsMap.get(key)!;
      current.qty += item.quantity;
      current.revenue += item.priceInCents * item.quantity;
    });
  });

  const topSellingItems = Array.from(itemsMap.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const lowStockAlerts: {
    productName: string;
    variantName: string;
    stock: number;
    id: string;
    productId: string;
  }[] = [];

  storeProducts.forEach((product) => {
    product.variants.forEach((variant) => {
      if (variant.stock <= LOW_STOCK_LIMIT) {
        lowStockAlerts.push({
          productName: product.name,
          variantName: variant.name,
          stock: variant.stock,
          id: variant.id,
          productId: product.id,
        });
      }
    });
  });

  lowStockAlerts.sort((a, b) => a.stock - b.stock);
  const topLowStockAlerts = lowStockAlerts.slice(0, 5);

  // Loja nova: guia de primeiros passos no lugar dos alertas.
  const showGettingStarted = totalProductsCount === 0 || salesEver === 0;
  const gettingStartedSteps = [
    {
      done: totalProductsCount > 0,
      title: "Cadastre seu primeiro produto",
      hint: "Adicione foto, preço e estoque para a loja poder vender.",
      href: "/admin/products/new",
      action: "Cadastrar produto",
    },
    ...(store.enableOnlinePayments
      ? [
          {
            done: mpConnected,
            title: "Conecte o Mercado Pago",
            hint: "É por ele que você recebe os pagamentos por cartão e Pix.",
            href: "/admin/settings",
            action: "Conectar",
          },
        ]
      : []),
    {
      done: salesEver > 0,
      title: "Receba sua primeira venda",
      hint: "Compartilhe o link da loja com seus clientes.",
      href: null,
      action: null,
    },
  ];

  const customStart = period.key === "custom" ? start : undefined;
  const customEnd = period.key === "custom" ? end : undefined;

  return (
    <div className="space-y-6 md:space-y-8">
      {/* CABEÇALHO */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Dashboard
          </h2>
          <p className="text-muted-foreground">
            Visão geral da sua loja ·{" "}
            <span className="text-foreground font-medium">{period.label}</span>
          </p>
        </div>
        <DashboardFilter
          active={period.key}
          start={customStart}
          end={customEnd}
        />
      </div>

      {activeAnnouncements.length > 0 && (
        <div className="space-y-3">
          {activeAnnouncements.map((announcement) => (
            <ChangelogAlert
              key={announcement.id}
              title={announcement.title}
              content={announcement.content}
              type={announcement.type}
            />
          ))}
        </div>
      )}

      {/* AVISO: Mercado Pago desconectado (lojas que já vendem) */}
      {store.enableOnlinePayments && !mpConnected && !showGettingStarted && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <CreditCard className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">
                {mpNeedsReconnect
                  ? "Reconecte o Mercado Pago"
                  : "Conecte o Mercado Pago"}
              </p>
              <p className="text-sm">
                {mpNeedsReconnect
                  ? "A conexão com a sua conta expirou. Enquanto isso, os clientes não conseguem pagar online."
                  : "Sua loja aceita pagamentos online, mas ainda não há uma conta conectada para recebê-los."}
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="w-full shrink-0 sm:w-auto">
            <Link href="/admin/settings">
              {mpNeedsReconnect ? "Reconectar" : "Conectar agora"}
            </Link>
          </Button>
        </div>
      )}

      {/* PRIMEIROS PASSOS (loja nova) */}
      {showGettingStarted && (
        <Card>
          <CardHeader>
            <CardTitle>Primeiros passos</CardTitle>
            <CardDescription>
              Siga estes passos para colocar sua loja para vender.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {gettingStartedSteps.map((step) => (
              <div
                key={step.title}
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  {step.done ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        step.done && "text-muted-foreground line-through",
                      )}
                    >
                      {step.title}
                    </p>
                    <p className="text-muted-foreground text-xs">{step.hint}</p>
                  </div>
                </div>
                {!step.done && step.href && step.action && (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    <Link href={step.href}>{step.action}</Link>
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* NÚMEROS */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          className="col-span-2 xl:col-span-2"
          title="Receita no período"
          value={formatCentsToBRL(totalRevenueInCents)}
          icon={DollarSign}
          trend={
            <Trend
              current={totalRevenueInCents}
              previous={previous ? previous.revenue : null}
            />
          }
          description={
            period.previous === null
              ? "Pedidos pagos, em preparo, enviados ou entregues."
              : undefined
          }
        />

        <StatCard
          title="Pedidos pagos"
          value={totalOrdersCount}
          icon={ShoppingBag}
          trend={
            <Trend
              current={totalOrdersCount}
              previous={previous ? previous.orders : null}
            />
          }
        />

        <StatCard
          title="Ticket médio"
          value={formatCentsToBRL(averageTicketInCents)}
          icon={Receipt}
          description="Valor médio por pedido."
        />

        <StatCard
          title="Para preparar"
          value={ordersToShip}
          icon={Truck}
          description="Pagos, aguardando envio."
          href="/admin/orders"
          highlight={ordersToShip > 0}
        />

        <StatCard
          title="Aguardando pagamento"
          value={ordersAwaitingPayment}
          icon={Clock}
          description={
            store.enableOnlinePayments
              ? "Clientes que ainda não pagaram."
              : "Pedidos do catálogo a confirmar."
          }
          href="/admin/orders"
        />
      </div>

      {/* VENDAS E ÚLTIMOS PEDIDOS */}
      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Vendas no período</CardTitle>
            <CardDescription>
              Receita por {salesSeries.length > 31 ? "mês" : "dia"}, somando só
              pedidos pagos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SalesChart data={salesSeries} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle>Últimos pedidos</CardTitle>
              <CardDescription>Os 5 mais recentes da loja.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="shrink-0">
              <Link href="/admin/orders">
                Ver todos <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <div className="text-muted-foreground flex flex-col items-center justify-center py-8 text-center">
                <ShoppingBag className="mb-2 h-8 w-8 opacity-20" />
                <p>Nenhum pedido ainda.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href="/admin/orders"
                    className="hover:bg-muted/50 -mx-2 flex items-center justify-between gap-3 rounded-lg p-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        #{order.orderNumber}
                        {order.shippingAddress?.fullName
                          ? ` · ${order.shippingAddress.fullName}`
                          : ""}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {order.createdAt.toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold">
                        {formatCentsToBRL(order.totalPriceInCents)}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          STATUS_STYLES[order.status] ??
                            "bg-muted text-muted-foreground",
                        )}
                      >
                        {translateOrderStatus(order.status)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* MAIS VENDIDOS E ESTOQUE */}
      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="flex flex-col lg:col-span-4">
          <CardHeader>
            <CardTitle>Top 5 mais vendidos</CardTitle>
            <CardDescription>
              Os itens favoritos dos seus clientes em {period.label}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {topSellingItems.length === 0 ? (
              <div className="text-muted-foreground flex h-full flex-col items-center justify-center py-8 text-center">
                <Package className="mb-2 h-8 w-8 opacity-20" />
                <p>Nenhuma venda registrada no período selecionado.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {topSellingItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm leading-none font-medium">
                        {item.name}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        Variação: {item.variant}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="text-sm font-bold sm:text-base">
                        {item.qty} {item.qty === 1 ? "vendido" : "vendidos"}
                      </div>
                      <div className="text-primary text-xs font-medium">
                        {formatCentsToBRL(item.revenue)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col border-orange-200 shadow-sm lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" /> Fim de estoque
            </CardTitle>
            <CardDescription>
              Variações com {LOW_STOCK_LIMIT} unidades ou menos
              {lowStockAlerts.length > topLowStockAlerts.length
                ? ` (mostrando ${topLowStockAlerts.length} de ${lowStockAlerts.length})`
                : ""}
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {topLowStockAlerts.length === 0 ? (
              <div className="text-muted-foreground flex h-full flex-col items-center justify-center py-8 text-center">
                <p>Seu estoque está saudável!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topLowStockAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-orange-100 bg-orange-50/50 p-3 dark:border-orange-900/40 dark:bg-orange-950/20"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm leading-none font-medium">
                        {alert.productName}
                      </p>
                      <p className="text-muted-foreground mt-1 truncate text-xs">
                        Variação: {alert.variantName}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                      <div
                        className={`text-lg font-bold ${alert.stock === 0 ? "text-red-600" : "text-orange-600"}`}
                      >
                        {alert.stock}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        className="h-8 w-8 text-orange-600 hover:bg-orange-100 hover:text-orange-700"
                      >
                        <Link
                          href={`/admin/products/${alert.productId}`}
                          aria-label={`Editar ${alert.productName}`}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
