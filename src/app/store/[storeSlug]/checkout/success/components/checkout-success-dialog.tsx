"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCentsToBRL } from "@/helpers/money";

interface CheckoutSuccessDialogProps {
  enableOnlinePayments: boolean;
  storePhone?: string | null;
  storeName: string;
  orderNumber: number;
  orderTotalInCents: number;
  /** Pedido do Mercado Pago ainda não confirmado pelo webhook. */
  paymentPending?: boolean;
}

const CheckoutSuccessDialog = ({
  enableOnlinePayments,
  storePhone,
  storeName,
  orderNumber,
  orderTotalInCents,
  paymentPending = false,
}: CheckoutSuccessDialogProps) => {
  const router = useRouter();

  // O Mercado Pago pode redirecionar antes de o webhook confirmar o pagamento:
  // reconsulta por ~1 minuto para a tela virar "Pedido efetuado!" sozinha.
  useEffect(() => {
    if (!paymentPending) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 15) clearInterval(timer);
    }, 4000);
    return () => clearInterval(timer);
  }, [paymentPending, router]);

  let whatsappUrl = "";
  if (!enableOnlinePayments && storePhone) {
    const cleanPhone = storePhone.replace(/\D/g, "");
    const formattedTotal = formatCentsToBRL(orderTotalInCents);

    const message = `Olá! Acabei de fazer o pedido #${orderNumber} no valor de ${formattedTotal} na ${storeName}. Poderia me enviar as opções de pagamento (Link ou PIX) para eu finalizar a compra e enviar o comprovante?`;

    whatsappUrl = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`;
  }

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="max-w-[90%] rounded-[24px] p-6 text-center md:max-w-[500px] md:rounded-[32px] md:p-10">
        {paymentPending ? (
          <div className="bg-muted mx-auto flex h-24 w-24 items-center justify-center rounded-full">
            <Clock className="text-muted-foreground h-12 w-12" />
          </div>
        ) : (
          <Image
            src="/illustration.svg"
            alt="Success"
            width={300}
            height={300}
            className="mx-auto h-auto w-[200px] md:w-[260px]"
            priority
          />
        )}

        <DialogTitle className="mt-4 text-2xl font-bold md:mt-6 md:text-3xl">
          {paymentPending ? "Aguardando pagamento" : "Pedido efetuado!"}
        </DialogTitle>

        <DialogDescription className="text-muted-foreground font-medium md:mx-auto md:max-w-[90%] md:text-base">
          {paymentPending
            ? "Estamos aguardando a confirmação do seu pagamento. Se você já pagou, isso leva só alguns instantes. Para pagar ou ver o QR Code do Pix, acesse “Meus Pedidos”."
            : enableOnlinePayments
            ? "Seu pedido foi realizado com sucesso. Você receberá um e-mail de confirmação em breve. Você pode acompanhar o status na seção de “Meus Pedidos”."
            : "Seu pedido foi reservado com sucesso! Para que a loja inicie o preparo e envio, por favor, solicite o link de pagamento via WhatsApp."}
        </DialogDescription>

        <DialogFooter className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center sm:gap-4 md:mt-8">
          {!enableOnlinePayments && whatsappUrl ? (
            <Button
              className="w-full rounded-full bg-[#25D366] px-6 text-white hover:bg-[#1DA851] sm:w-auto"
              size="lg"
              asChild
            >
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-5 w-5" />
                Solicitar Pagamento
              </a>
            </Button>
          ) : (
            <Button
              className="w-full rounded-full px-6 sm:w-auto"
              size="lg"
              asChild
            >
              <Link href="/orders">Ver meus pedidos</Link>
            </Button>
          )}

          <Button
            className="w-full rounded-full px-6 sm:w-auto"
            variant="outline"
            size="lg"
            asChild
          >
            <Link href="/">Voltar para a loja</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutSuccessDialog;
