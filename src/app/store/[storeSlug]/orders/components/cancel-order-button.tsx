"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { cancelPendingOrderAction } from "@/actions/cancel-pending-order";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function confirm() {
    start(async () => {
      try {
        await cancelPendingOrderAction({ orderId });
        toast.success("Pedido cancelado.");
        setOpen(false);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível cancelar o pedido.",
        );
      } finally {
        // Se o pedido mudou de estado (ex.: foi pago), a tela precisa refletir.
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Cancelar pedido
      </Button>

      <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar este pedido?</DialogTitle>
            <DialogDescription>
              Os itens voltam para o estoque e, se você gerou um Pix, ele será
              cancelado e não poderá mais ser pago. Esta ação não pode ser
              desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirm}
              disabled={pending}
            >
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancelar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
