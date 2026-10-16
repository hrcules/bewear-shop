"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function OrdersFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [startDate, setStartDate] = useState(searchParams.get("start") || "");
  const [endDate, setEndDate] = useState(searchParams.get("end") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "all");

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());

    if (startDate) params.set("start", startDate);
    else params.delete("start");

    if (endDate) params.set("end", endDate);
    else params.delete("end");

    if (status && status !== "all") params.set("status", status);
    else params.delete("status");

    router.push(`/admin/orders?${params.toString()}`);
  };

  const handleClear = () => {
    setStartDate("");
    setEndDate("");
    setStatus("all");
    router.push(`/admin/orders`);
  };

  const hasFilters = startDate || endDate || (status && status !== "all");

  return (
    <form
      onSubmit={handleFilter}
      className="bg-muted/20 mb-6 flex flex-wrap items-end gap-4 rounded-lg p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="start" className="text-sm font-medium">
          Data Inicial
        </label>
        <Input
          type="date"
          id="start"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="end" className="text-sm font-medium">
          Data Final
        </label>
        <Input
          type="date"
          id="end"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Status do Pedido</label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="bg-background w-[180px]">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="paid">Pago (Preparando)</SelectItem>
            <SelectItem value="shipped">Enviado</SelectItem>
            <SelectItem value="delivered">Entregue</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
            <SelectItem value="refunded">Reembolsado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit">
          <Search className="mr-2 h-4 w-4" />
          Filtrar
        </Button>

        {hasFilters && (
          <Button type="button" variant="ghost" onClick={handleClear}>
            <X className="mr-2 h-4 w-4" />
            Limpar
          </Button>
        )}
      </div>
    </form>
  );
}
