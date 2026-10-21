import { and, eq, gte, lte, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  DollarSign,
  Package,
  ShoppingBag,
  ArrowRight,
} from "lucide-react";

import { db } from "@/db";
import {
  orderTable,
  productTable,
  storeTable,
  announcementTable,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { formatCentsToBRL } from "@/helpers/money";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import DashboardFilter from "./components/dashboard-filter";
import { getTenantStore } from "@/lib/tentat";
// ✅ Importe o novo componente (ajuste o caminho se necessário)
import { ChangelogAlert } from "./components/changelog-alert";

interface AdminDashboardPageProps {
  searchParams: Promise<{
    start?: string;
    end?: string;
  }>;
}

export default async function AdminDashboardPage({
  searchParams,
}: AdminDashboardPageProps) {
  const { start, end } = await searchParams;

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

  if (start) {
    const startDate = new Date(`${start}T00:00:00`);
    orderConditions.push(gte(orderTable.createdAt, startDate));
  }
  if (end) {
    const endDate = new Date(`${end}T23:59:59.999`);
    orderConditions.push(lte(orderTable.createdAt, endDate));
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

  const successfulOrders = orders.filter(
    (o) =>
      !["pending", "canceled", "cancelled", "refunded"].includes(o.status),
  );
  const totalRevenueInCents = successfulOrders.reduce(
    (acc, order) => acc + order.totalPriceInCents,
    0,
  );
  const totalOrdersCount = successfulOrders.length;
  const totalProductsCount = storeProducts.length;

  const itemsMap = new Map<
    string,
    { name: string; variant: string; qty: number; revenue: number }
  >();

  successfulOrders.forEach((order) => {
    order.items.forEach((item) => {
      const key = item.productVariant.id;
      if (!itemsMap.has(key)) {
        itemsMap.set(key, {
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
      if (variant.stock <= 5) {
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

  return (
    <div className="space-y-8">
      {/* CABEÇALHO */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Visão geral do desempenho da sua loja.
          </p>
        </div>
        <DashboardFilter />
      </div>

      {/* ✅ RENDEREZAÇÃO LIMPA DO COMPONENTE DE ANÚNCIOS */}
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Receita no Período
            </CardTitle>
            <DollarSign className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-primary text-2xl font-bold">
              {formatCentsToBRL(totalRevenueInCents)}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {start || end
                ? "Filtrado pelas datas selecionadas."
                : "Acumulado de todo o período."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Vendas no Período
            </CardTitle>
            <ShoppingBag className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrdersCount}</div>
            <p className="text-muted-foreground mt-1 text-xs">
              {start || end
                ? "Pedidos dentro do filtro."
                : "Pedidos pagos ou processando."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Produtos no Catálogo
            </CardTitle>
            <Package className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProductsCount}</div>
            <p className="text-muted-foreground mt-1 text-xs">
              Modelos de produtos cadastrados.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Alertas de Estoque
            </CardTitle>
            <AlertTriangle
              className={`h-4 w-4 ${lowStockAlerts.length > 0 ? "text-red-500" : "text-muted-foreground"}`}
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowStockAlerts.length}</div>
            <p className="text-muted-foreground mt-1 text-xs">
              Variações com menos de 5 unidades.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="flex flex-col lg:col-span-4">
          <CardHeader>
            <CardTitle>Top 5 Mais Vendidos no Período</CardTitle>
            <CardDescription>
              Os itens favoritos dos seus clientes nas datas filtradas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {topSellingItems.length === 0 ? (
              <div className="text-muted-foreground flex h-full flex-col items-center justify-center py-8">
                <Package className="mb-2 h-8 w-8 opacity-20" />
                <p>Nenhuma venda registrada no período selecionado.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {topSellingItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm leading-none font-medium">
                        {item.name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Variação: {item.variant}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="font-bold">{item.qty} vendidos</div>
                      <div className="text-primary text-xs font-medium">
                        {formatCentsToBRL(item.revenue)} gerados
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
              <AlertTriangle className="h-5 w-5" /> Fim de Estoque
            </CardTitle>
            <CardDescription>
              Produtos que precisam de reposição urgente.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {topLowStockAlerts.length === 0 ? (
              <div className="text-muted-foreground flex h-full flex-col items-center justify-center py-8">
                <p>Seu estoque está saudável!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {topLowStockAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between rounded-lg border border-orange-100 bg-orange-50/50 p-3"
                  >
                    <div>
                      <p className="text-sm leading-none font-medium">
                        {alert.productName}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Variação: {alert.variantName}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
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
                        <Link href={`/admin/products/${alert.productId}`}>
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
