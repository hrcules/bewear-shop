"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import Orders from "./orders";

type OrdersProps = React.ComponentProps<typeof Orders>;

type FilterKey = "all" | "pending" | "active" | "delivered" | "cancelled";

const FILTERS: Array<{
  key: FilterKey;
  label: string;
  statuses: string[] | null;
  emptyTitle: string;
  emptyMessage: string;
}> = [
  {
    key: "all",
    label: "Todos",
    statuses: null,
    emptyTitle: "Nenhum pedido ainda",
    emptyMessage:
      "Você ainda não fez nenhum pedido nesta loja. Quando comprar, seus pedidos aparecerão aqui.",
  },
  {
    key: "pending",
    label: "Aguardando pagamento",
    statuses: ["pending"],
    emptyTitle: "Nenhum pedido aguardando pagamento",
    emptyMessage: "Você não tem pedidos pendentes de pagamento no momento.",
  },
  {
    key: "active",
    label: "Em andamento",
    statuses: ["paid", "processing", "shipped"],
    emptyTitle: "Nenhum pedido em andamento",
    emptyMessage: "Pedidos pagos, em preparo ou a caminho aparecerão aqui.",
  },
  {
    key: "delivered",
    label: "Entregues",
    statuses: ["delivered"],
    emptyTitle: "Nenhum pedido entregue",
    emptyMessage: "Os pedidos que você já recebeu aparecerão aqui.",
  },
  {
    key: "cancelled",
    label: "Cancelados",
    statuses: ["cancelled", "canceled", "refunded"],
    emptyTitle: "Nenhum pedido cancelado",
    emptyMessage: "Pedidos cancelados ou reembolsados aparecerão aqui.",
  },
];

function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action: React.ReactNode;
}) {
  return (
    <div className="mt-12 flex flex-1 flex-col items-center justify-center space-y-4 px-4 text-center">
      <div className="bg-muted/50 rounded-full p-6">
        <svg
          className="text-muted-foreground/50 h-12 w-12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          ></path>
        </svg>
      </div>
      <div className="space-y-1">
        <h2 className="text-foreground text-2xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-muted-foreground mx-auto max-w-md">{message}</p>
      </div>
      {action}
    </div>
  );
}

const OrdersWithFilter = ({ orders, onlinePayments }: OrdersProps) => {
  const [filter, setFilter] = useState<FilterKey>("all");

  // Cliente que nunca fez um pedido: não faz sentido mostrar filtros.
  if (orders.length === 0) {
    const empty = FILTERS[0];
    return (
      <EmptyState
        title={empty.emptyTitle}
        message={empty.emptyMessage}
        action={
          <Button asChild className="rounded-full">
            <Link href="/">Ver produtos</Link>
          </Button>
        }
      />
    );
  }

  const countFor = (statuses: string[] | null) =>
    statuses === null
      ? orders.length
      : orders.filter((order) => statuses.includes(order.status)).length;

  const current = FILTERS.find((item) => item.key === filter) ?? FILTERS[0];
  const filtered =
    current.statuses === null
      ? orders
      : orders.filter((order) => current.statuses!.includes(order.status));

  return (
    <div className="space-y-6">
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0">
        {FILTERS.map((item) => (
          <Button
            key={item.key}
            type="button"
            size="sm"
            variant={filter === item.key ? "default" : "outline"}
            className="shrink-0 rounded-full"
            onClick={() => setFilter(item.key)}
          >
            {item.label} ({countFor(item.statuses)})
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={current.emptyTitle}
          message={current.emptyMessage}
          action={
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setFilter("all")}
            >
              Ver todos os pedidos
            </Button>
          }
        />
      ) : (
        <Orders orders={filtered} onlinePayments={onlinePayments} />
      )}
    </div>
  );
};

export default OrdersWithFilter;
