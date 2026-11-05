import { BarChart3 } from "lucide-react";

import { formatCentsToBRL } from "@/helpers/money";
import type { SalesPoint } from "@/lib/dashboard-period";

export default function SalesChart({ data }: { data: SalesPoint[] }) {
  const max = Math.max(0, ...data.map((point) => point.valueInCents));

  if (data.length === 0 || max === 0) {
    return (
      <div className="text-muted-foreground flex h-full min-h-48 flex-col items-center justify-center py-8 text-center">
        <BarChart3 className="mb-2 h-8 w-8 opacity-20" />
        <p>Nenhuma venda registrada no período selecionado.</p>
      </div>
    );
  }

  const best = data.reduce((top, point) =>
    point.valueInCents > top.valueInCents ? point : top,
  );

  return (
    <div className="space-y-3">
      <div
        className="flex h-44 items-end gap-1 sm:h-52 sm:gap-1.5"
        role="img"
        aria-label="Gráfico de receita por período"
      >
        {data.map((point) => {
          const height =
            point.valueInCents > 0
              ? Math.max((point.valueInCents / max) * 100, 4)
              : 0;

          return (
            <div
              key={point.key}
              className="group flex h-full min-w-0 flex-1 items-end"
              title={`${point.label}: ${formatCentsToBRL(point.valueInCents)} (${point.count} ${point.count === 1 ? "pedido" : "pedidos"})`}
            >
              <div
                className="bg-primary/70 group-hover:bg-primary w-full rounded-t-sm transition-colors"
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="text-muted-foreground flex justify-between text-xs">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>

      <p className="text-muted-foreground text-xs">
        Maior receita:{" "}
        <span className="text-foreground font-medium">
          {best.label} · {formatCentsToBRL(best.valueInCents)}
        </span>{" "}
        ({best.count} {best.count === 1 ? "pedido" : "pedidos"})
      </p>
    </div>
  );
}
