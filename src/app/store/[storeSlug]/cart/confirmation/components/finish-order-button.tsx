"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, CreditCard, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { createCheckoutSession } from "@/actions/create-checkout-session";
import { createDirectOrder } from "@/actions/create-direct-order";
import { createPixPaymentAction } from "@/actions/create-pix-payment";
import { Button } from "@/components/ui/button";
import { useFinishOrder } from "@/hooks/mutations/use-finish-order";

interface FinishOrderButtonProps {
  variantId?: string;
  quantity?: number;
  addressId?: string;
  enableOnlinePayments?: boolean;
}

const FinishOrderButton = ({
  variantId,
  quantity,
  addressId,
  enableOnlinePayments = true,
}: FinishOrderButtonProps) => {
  const router = useRouter();
  const finishOrderMutation = useFinishOrder();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<"card" | "pix">("card");

  const createDirectOrderMutation = useMutation({
    mutationFn: () =>
      createDirectOrder({
        variantId: variantId!,
        quantity: quantity!,
        addressId: addressId!,
      }),
  });

  const isPending =
    finishOrderMutation.isPending ||
    createDirectOrderMutation.isPending ||
    isRedirecting;

  const handleFinishOrder = async () => {
    try {
      setIsRedirecting(true);
      let orderId: string;

      if (variantId && quantity && addressId) {
        const result = await createDirectOrderMutation.mutateAsync();
        orderId = result.orderId;
      } else {
        const result = await finishOrderMutation.mutateAsync();
        orderId = result.orderId;
      }

      if (!enableOnlinePayments) {
        toast.success("Pedido enviado com sucesso!");
        router.push(`/checkout/success?orderId=${orderId}`);
        return;
      }

      if (paymentMethod === "card") {
        const response = await createCheckoutSession({ orderId });

        if (response?.checkoutUrl) {
          window.location.href = response.checkoutUrl;
        } else {
          throw new Error("O Stripe não retornou a URL de checkout.");
        }
      } else {
        const response = await createPixPaymentAction({ orderId });

        if (response?.success) {
          router.push(`/checkout/pix?orderId=${orderId}`);
        } else {
          throw new Error("Erro ao gerar chave PIX. Tente novamente.");
        }
      }
    } catch (error) {
      console.error("Erro no fechamento do pedido:", error);

      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Ocorreu um erro ao gerar o pedido. Tente novamente.");
      }
    } finally {
      setIsRedirecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {enableOnlinePayments && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Como você prefere pagar?</p>

          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setPaymentMethod("card")}
              disabled={isPending}
              className={`flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all ${
                paymentMethod === "card"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-muted text-muted-foreground hover:border-primary/50"
              }`}
            >
              <CreditCard className="mb-2 h-6 w-6" />
              <span className="text-sm font-semibold">Cartão de Crédito</span>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod("pix")}
              disabled={isPending}
              className={`flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all ${
                paymentMethod === "pix"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                  : "border-muted text-muted-foreground hover:border-emerald-500/50"
              }`}
            >
              <QrCode className="mb-2 h-6 w-6" />
              <span className="text-sm font-semibold">PIX Rápido</span>
            </button>
          </div>
        </div>
      )}

      <Button
        className="w-full rounded-full"
        size="lg"
        onClick={handleFinishOrder}
        disabled={isPending}
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isPending
          ? "Processando..."
          : !enableOnlinePayments
            ? "Enviar Pedido"
            : paymentMethod === "card"
              ? "Ir para o Pagamento"
              : "Gerar Código PIX"}
      </Button>
    </div>
  );
};

export default FinishOrderButton;
