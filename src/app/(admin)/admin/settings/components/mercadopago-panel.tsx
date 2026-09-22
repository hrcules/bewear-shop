"use client";

import { useEffect, useState, useTransition } from "react";
import { CreditCard, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  connectMercadoPago,
  manageMercadoPago,
} from "@/actions/mercadopago-connection";
import { updateOnlinePaymentsAction } from "@/actions/update-store-settings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type Props = {
  available: boolean;
  onlinePaymentsEnabled: boolean;
  enabled: boolean;
  sellerId: string | null;
  status: string | null;
  result?: string;
  reviews: number;
};

export function MercadoPagoPanel({
  available,
  onlinePaymentsEnabled,
  enabled,
  sellerId,
  status,
  result,
  reviews,
}: Props) {
  const [pending, start] = useTransition();
  const [onlineEnabled, setOnlineEnabled] = useState(onlinePaymentsEnabled);
  const router = useRouter();

  useEffect(() => {
    setOnlineEnabled(onlinePaymentsEnabled);
  }, [onlinePaymentsEnabled]);

  function updateOnlinePayments(checked: boolean) {
    const previous = onlineEnabled;
    setOnlineEnabled(checked);

    start(async () => {
      try {
        await updateOnlinePaymentsAction({ enabled: checked });
        toast.success(
          checked
            ? "Pagamentos online ativados."
            : "Loja alterada para o modo catálogo.",
        );
        router.refresh();
      } catch (error) {
        setOnlineEnabled(previous);
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar o modelo de vendas.",
        );
      }
    });
  }

  function run(command: "connect" | "enable" | "disconnect") {
    start(async () => {
      try {
        if (command === "connect") {
          window.location.assign((await connectMercadoPago()).url);
          return;
        }

        await manageMercadoPago(command);

        if (command === "disconnect") {
          setOnlineEnabled(false);
        }

        toast.success(
          command === "disconnect"
            ? "Conta desconectada. Sua loja voltou para o modo catálogo."
            : "Mercado Pago ativado para novas vendas.",
        );
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar a conexão.",
        );
      }
    });
  }

  return (
    <>
      <Card className="border-primary/50 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Modelo de Vendas
          </CardTitle>
          <CardDescription>
            Escolha se a loja recebe pagamentos online ou funciona como catálogo
            com finalização pelo WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-6 rounded-lg border p-4">
            <div className="space-y-1">
              <p className="font-semibold">Aceitar Pagamentos Online</p>
              <p className="text-muted-foreground text-sm">
                Se desativado, a loja reserva o estoque e o cliente finaliza o
                pagamento manualmente via WhatsApp.
              </p>
            </div>
            <Switch
              checked={onlineEnabled}
              onCheckedChange={updateOnlinePayments}
              disabled={pending}
              aria-label="Aceitar pagamentos online"
            />
          </div>
        </CardContent>
      </Card>

      {onlineEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Receber com Mercado Pago
            </CardTitle>
            <CardDescription>
              Conecte sua própria conta Mercado Pago para receber as vendas
              diretamente nela.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!available && (
              <p role="status" className="text-muted-foreground text-sm">
                A integração está sendo preparada. Enquanto isso, a configuração
                de pagamentos atual da loja permanece inalterada.
              </p>
            )}

            {result === "connected" && (
              <p role="status" className="text-sm">
                Conta conectada com sucesso. Agora ative o Checkout Pro para usar
                o Mercado Pago nas próximas vendas.
              </p>
            )}

            {result === "error" && (
              <p role="alert" className="text-destructive text-sm">
                A conexão não foi concluída. Autorize novamente com a mesma
                conta. Se já existem pedidos, a troca de recebedor precisa de
                conciliação.
              </p>
            )}

            <div className="rounded-lg border p-4">
              <p className="font-medium">
                {sellerId
                  ? `Conta Mercado Pago: ${sellerId}`
                  : "Nenhuma conta Mercado Pago conectada"}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {status === "connected"
                  ? enabled
                    ? "Pagamentos via Mercado Pago estão ativos."
                    : "Conta conectada. Falta ativar o Checkout Pro."
                  : status === "reconnect"
                    ? "A conta precisa ser reconectada."
                    : "Conecte uma conta para concluir a configuração."}
              </p>
            </div>

            <p className="text-muted-foreground text-sm">
              Os meios de pagamento, taxas e prazos seguem as condições da sua
              própria conta Mercado Pago.
            </p>

            {reviews > 0 && (
              <p role="alert">
                {reviews} pedido(s) precisam de conciliação. Confira a área de
                pagamentos e o Mercado Pago antes de liberar estoque.
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={pending || !available}
                onClick={() => run("connect")}
              >
                {pending
                  ? "Aguarde..."
                  : sellerId
                    ? "Reconectar conta"
                    : "Conectar Mercado Pago"}
              </Button>

              {status === "connected" && !enabled && (
                <Button
                  type="button"
                  disabled={pending || !available}
                  onClick={() => run("enable")}
                >
                  Ativar Checkout Pro
                </Button>
              )}

              {status === "connected" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run("disconnect")}
                >
                  Desconectar Mercado Pago
                </Button>
              )}
            </div>

            <p className="text-muted-foreground text-xs">
              Desconectar bloqueia novas cobranças e coloca a loja no modo
              catálogo. Pedidos anteriores continuam sendo acompanhados. Para
              revogar também a autorização no Mercado Pago, acesse as aplicações
              autorizadas na sua conta.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
