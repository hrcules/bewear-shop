"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { createDirectOrder } from "@/actions/create-direct-order";
import { createMercadoPagoCheckout } from "@/actions/mercadopago-checkout";
import { Button } from "@/components/ui/button";
import { useFinishOrder } from "@/hooks/mutations/use-finish-order";

interface FinishOrderButtonProps {
  variantId?: string;
  quantity?: number;
  addressId?: string;
  enableOnlinePayments?: boolean;
  checkoutProvider?: string;
}

const FinishOrderButton = ({
  variantId,
  quantity,
  addressId,
  enableOnlinePayments = true,
  checkoutProvider = "legacy",
}: FinishOrderButtonProps) => {
  const router = useRouter();
  const finishOrderMutation = useFinishOrder();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const createDirectOrderMutation = useMutation({
    mutationFn: () =>
      createDirectOrder({
        variantId: variantId!,
        quantity: quantity!,
        addressId: addressId!,
      }),
  });

  // Loja com pagamento online ligado, mas sem Mercado Pago conectado/ativo.
  const paymentNotReady =
    enableOnlinePayments && checkoutProvider !== "mercadopago";

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

      // Modo catálogo: o pedido segue para o WhatsApp da loja.
      if (!enableOnlinePayments) {
        toast.success("Pedido enviado com sucesso!");
        router.push(`/checkout/success?orderId=${orderId}`);
        return;
      }

      const response = await createMercadoPagoCheckout({ orderId });
      window.location.href = response.checkoutUrl;
    } catch (error) {
      console.error("Erro no fechamento do pedido:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Ocorreu um erro ao gerar o pedido. Tente novamente.",
      );
      setIsRedirecting(false);
    }
  };

  return (
    <div className="space-y-4">
      {paymentNotReady && (
        <p role="status" className="text-muted-foreground text-sm">
          O pagamento online desta loja ainda não está disponível. Tente
          novamente mais tarde ou fale com a loja.
        </p>
      )}

      <Button
        className="w-full rounded-full"
        size="lg"
        onClick={handleFinishOrder}
        disabled={isPending || paymentNotReady}
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isPending
          ? "Processando..."
          : enableOnlinePayments
            ? "Ir para o Pagamento"
            : "Enviar Pedido"}
      </Button>
    </div>
  );
};

export default FinishOrderButton;
