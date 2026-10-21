"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateOrderStatusAction } from "@/actions/update-order-status";

interface OrderStatusSelectorProps {
  orderId: string;
  currentStatus: string;
}

export function OrderStatusSelector({
  orderId,
  currentStatus,
}: OrderStatusSelectorProps) {
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = (newStatus: string) => {
    startTransition(async () => {
      try {
        await updateOrderStatusAction({ orderId, newStatus });
        toast.success("Status atualizado com sucesso!");
      } catch (error) {
        if (error instanceof Error) {
          toast.error(error.message);
        } else {
          toast.error("Erro ao atualizar o status do pedido.");
        }
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {isPending && (
        <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
      )}
      <Select
        defaultValue={currentStatus}
        onValueChange={handleStatusChange}
        disabled={isPending || currentStatus === "refunded"}
      >
        <SelectTrigger className="h-8 w-[140px] text-xs font-medium">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">Pendente</SelectItem>
          <SelectItem value="paid">Pago (A Preparar)</SelectItem>
          <SelectItem value="shipped">Enviado</SelectItem>
          <SelectItem value="delivered">Entregue</SelectItem>
          <SelectItem value="cancelled">Cancelado</SelectItem>
          <SelectItem value="refunded" disabled>
            Reembolsado
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
