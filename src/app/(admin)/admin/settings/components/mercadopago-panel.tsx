"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  connectMercadoPago,
  manageMercadoPago,
} from "@/actions/mercadopago-connection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  available: boolean;
  enabled: boolean;
  sellerId: string | null;
  status: string | null;
  result?: string;
  reviews: number;
};
export function MercadoPagoPanel({
  available,
  enabled,
  sellerId,
  status,
  result,
  reviews,
}: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  function run(command: "connect" | "enable" | "disable" | "disconnect") {
    start(async () => {
      try {
        if (command === "connect") {
          window.location.assign((await connectMercadoPago()).url);
          return;
        }
        await manageMercadoPago(command);
        toast.success(
          command === "disconnect"
            ? "Conta desconectada para novas vendas. Sua loja está no modo catálogo."
            : "Configuração de pagamento atualizada.",
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
    <Card>
      <CardHeader>
        <CardTitle>Receber com Mercado Pago</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>
          Conecte sua própria conta para receber suas vendas. Você autoriza a
          conexão no site do Mercado Pago, sem informar sua senha aqui.
        </p>
        {!available && (
          <p role="status">
            A conexão está sendo preparada. Seus pagamentos atuais continuam
            disponíveis.
          </p>
        )}
        {result === "connected" && (
          <p role="status">
            Conta conectada. Ative o Checkout Pro para usá-la nas próximas
            vendas.
          </p>
        )}
        {result === "error" && (
          <p role="alert">
            A conexão não foi concluída. Autorize novamente com a mesma conta.
            Se já existem pedidos, a troca de recebedor precisa de conciliação.
          </p>
        )}
        <p className="font-medium">
          {sellerId
            ? `Conta Mercado Pago: ${sellerId}`
            : "Nenhuma conta conectada"}{" "}
          —{" "}
          {status === "connected"
            ? "Conectada"
            : status === "reconnect"
              ? "Reconexão necessária"
              : "Desconectada"}
        </p>
        <p>
          {enabled
            ? "Checkout Pro selecionado: o cliente escolhe como pagar no Mercado Pago."
            : "Checkout Pro ainda não ativado."}
        </p>
        <p className="text-muted-foreground text-sm">
          Antes de ativar, deixe o desconto exclusivo de Pix em 0. Os meios
          disponíveis, taxas e prazos seguem as condições da sua conta Mercado
          Pago.
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
          {enabled && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => run("disable")}
            >
              Usar integração anterior
            </Button>
          )}
          {status === "connected" && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => run("disconnect")}
            >
              Desconectar e usar catálogo
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          Desconectar bloqueia novas cobranças; pedidos anteriores continuam
          sendo acompanhados. Para revogar também a autorização no Mercado Pago,
          acesse as aplicações autorizadas na sua conta.
        </p>
      </CardContent>
    </Card>
  );
}
