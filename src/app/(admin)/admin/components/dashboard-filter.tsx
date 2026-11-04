"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PeriodKey = "7" | "30" | "all" | "custom";

interface DashboardFilterProps {
  active: PeriodKey;
  start?: string;
  end?: string;
}

const PRESETS: Array<{ key: PeriodKey; label: string; href: string }> = [
  { key: "7", label: "7 dias", href: "/admin?period=7" },
  { key: "30", label: "30 dias", href: "/admin" },
  { key: "all", label: "Todo o período", href: "/admin?period=all" },
];

export default function DashboardFilter({
  active,
  start = "",
  end = "",
}: DashboardFilterProps) {
  const router = useRouter();

  const [startDate, setStartDate] = useState(start);
  const [endDate, setEndDate] = useState(end);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();

    const params = new URLSearchParams();
    if (startDate) params.set("start", startDate);
    if (endDate) params.set("end", endDate);

    const query = params.toString();
    router.push(query ? `/admin?${query}` : "/admin");
  };

  return (
    <div className="bg-muted/20 flex w-full flex-col gap-4 rounded-lg border p-4 lg:w-auto">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset.key}
            asChild
            size="sm"
            variant={active === preset.key ? "default" : "outline"}
            className="rounded-full"
          >
            <Link href={preset.href}>{preset.label}</Link>
          </Button>
        ))}
      </div>

      <form
        onSubmit={handleFilter}
        className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            htmlFor="start"
            className="text-muted-foreground text-sm font-medium"
          >
            Data inicial
          </label>
          <Input
            type="date"
            id="start"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            htmlFor="end"
            className="text-muted-foreground text-sm font-medium"
          >
            Data final
          </label>
          <Input
            type="date"
            id="end"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
          <Button
            type="submit"
            variant="secondary"
            className="flex-1 sm:flex-none"
            disabled={!startDate && !endDate}
          >
            <Search className="mr-2 h-4 w-4" />
            Filtrar
          </Button>

          {active === "custom" && (
            <Button
              asChild
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
            >
              <Link href="/admin">
                <X className="mr-2 h-4 w-4" />
                Limpar
              </Link>
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
