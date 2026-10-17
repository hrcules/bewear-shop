"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  getPendingPayment,
  type PendingPaymentResult,
} from "@/actions/mercadopago-pix";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PixData = Extract<PendingPaymentResult, { kind: "pix" }>;

export function PendingPaymentButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pix, setPix] = useState<PixData | null>(null);
  const [copied, setCopied] = useState(false);

  function open() {
    start(async () => {
      try {
        const result = await getPendingPayment({ orderId });
        if (result.kind === "pix") return setPix(result);
        if (result.kind === "checkout") {
          window.location.href = result.url;
          return;
        }
        if (result.kind === "paid") {
          toast.success("Pagamento confirmado!");
          router.refresh();
          return;
        }
        toast.error(
          "Não encontramos um pagamento em aberto para este pedido. Ele pode ter expirado.",
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Não foi possível abrir.",
        );
      }
    });
  }

  // Enquanto o QR Code está aberto, confere a cada 5s se o Pix foi pago.
  useEffect(() => {
    if (!pix) return;
    const timer = setInterval(async () => {
      try {
        const result = await getPendingPayment({ orderId });
        if (result.kind === "paid") {
          setPix(null);
          toast.success("Pagamento confirmado!");
          router.refresh();
        }
      } catch {
        // tenta de novo no próximo ciclo
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [pix, orderId, router]);

  async function copy() {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o código manualmente.");
    }
  }

  return (
    <>
      <Button size="sm" onClick={open} disabled={pending}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Pagar agora
      </Button>

      <Dialog open={!!pix} onOpenChange={(value) => !value && setPix(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pague com Pix</DialogTitle>
            <DialogDescription>
              Escaneie o QR Code ou use o código copia e cola. A confirmação é
              automática.
            </DialogDescription>
          </DialogHeader>

          {pix?.qrCodeBase64 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${pix.qrCodeBase64}`}
              alt="QR Code Pix"
              className="mx-auto h-56 w-56"
            />
          )}

          <div className="space-y-2">
            <p className="bg-muted max-h-24 overflow-auto rounded-md p-2 text-xs break-all">
              {pix?.qrCode}
            </p>
            <Button variant="outline" className="w-full" onClick={copy}>
              {copied ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              {copied ? "Copiado!" : "Copiar código Pix"}
            </Button>
            {pix?.expiresAt && (
              <p className="text-muted-foreground text-center text-xs">
                Válido até {new Date(pix.expiresAt).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
