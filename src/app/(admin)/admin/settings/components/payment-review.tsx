"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reconcileMercadoPago } from "@/actions/reconcile-mercadopago";
import { Button } from "@/components/ui/button";
export function PaymentReview({
  orders,
}: {
  orders: { id: string; number: number; status: string }[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  function run(orderId: string, cancel: boolean) {
    start(async () => {
      try {
        await reconcileMercadoPago({ orderId, cancel });
        toast.success("Pedido verificado.");
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Não foi possível verificar.",
        );
      }
    });
  }
  if (!orders.length) return null;
  return (
    <section className="space-y-3 rounded-xl border p-5">
      <h3 className="font-semibold">Pagamentos para acompanhar</h3>
      <p className="text-sm">
        Verifique pagamentos pendentes ou sinalizados. A liberação de estoque só
        acontece após conferir o vencimento do checkout e a ausência de
        pagamentos ativos.
      </p>
      {orders.map((order) => (
        <div
          key={order.id}
          className="flex flex-wrap items-center gap-3 border-t pt-3"
        >
          <span>Pedido #{order.number}</span>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => run(order.id, false)}
          >
            Verificar pagamento
          </Button>
          {order.status === "pending" && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => run(order.id, true)}
            >
              Cancelar reserva vencida
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
