"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  connectMercadoPago,
  disconnectMercadoPago,
  setMercadoPagoCheckout,
} from "@/actions/mercadopago-connection";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { MercadoPagoLogo } from "./mercadopago-logo";

type Props = {
  available: boolean;
  sellerId: string | null;
  status: string | null;
  result?: string;
  active: boolean;
};

export function MercadoPagoPanel({
  available,
  sellerId,
  status,
  result,
  active,
}: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const connected = status === "connected";

  function connect() {
    start(async () => {
      try {
        window.location.assign((await connectMercadoPago()).url);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Não foi possível conectar.",
        );
      }
    });
  }

  function toggle(enabled: boolean) {
    start(async () => {
      try {
        await setMercadoPagoCheckout(enabled);
        toast.success(
          enabled
            ? "Mercado Pago ativado para novas vendas."
            : "Mercado Pago desativado.",
        );
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Não foi possível alterar.",
        );
      }
    });
  }

  function disconnect() {
    start(async () => {
      try {
        await disconnectMercadoPago();
        toast.success("Conta Mercado Pago desconectada.");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível desconectar.",
        );
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MercadoPagoLogo className="h-6 w-auto object-contain" />
          Mercado Pago
        </CardTitle>
        <CardDescription>
          Conecte sua conta Mercado Pago para receber as vendas diretamente
          nela.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!available && (
          <p role="status" className="text-muted-foreground text-sm">
            A integração ainda não está disponível neste ambiente.
          </p>
        )}
        {result === "connected" && (
          <p role="status" className="text-sm">
            Conta conectada com sucesso.
          </p>
        )}
        {result === "error" && (
          <p role="alert" className="text-destructive text-sm">
            A conexão não foi concluída. Tente autorizar novamente.
          </p>
        )}

        <div className="rounded-lg border p-4">
          <p className="font-medium">
            {connected && sellerId
              ? `Conta conectada: ${sellerId}`
              : "Nenhuma conta Mercado Pago conectada"}
          </p>
          {status === "reconnect" && (
            <p
              role="alert"
              className="mt-2 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                A conexão expirou ou foi revogada. Seus clientes não conseguem
                pagar online até você reconectar.
              </span>
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={connect} disabled={pending || !available}>
            {status === "reconnect" || connected
              ? "Reconectar"
              : "Conectar Mercado Pago"}
          </Button>
          {connected && (
            <Button
              variant={active ? "outline" : "default"}
              onClick={() => toggle(!active)}
              disabled={pending}
            >
              {active ? "Desativar nas vendas" : "Ativar nas vendas"}
            </Button>
          )}
          {connected && (
            <Button variant="outline" onClick={disconnect} disabled={pending}>
              Desconectar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
