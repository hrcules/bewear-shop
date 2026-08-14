"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AcceptTermsDialogProps {
  storeId: string;
  acceptAction: (storeId: string) => Promise<void>;
}

export function AcceptTermsDialog({
  storeId,
  acceptAction,
}: AcceptTermsDialogProps) {
  const [isChecked, setIsChecked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleAccept = () => {
    startTransition(async () => {
      await acceptAction(storeId);
      router.refresh();
    });
  };

  return (
    <Dialog open={true}>
      <DialogContent
        // max-w-lg deixa mais elegante, e max-h-[90vh] garante que não vaze da tela
        className="flex max-h-[90vh] w-[95vw] max-w-lg flex-col overflow-hidden p-6 sm:w-full"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex flex-col items-center gap-1 space-y-0">
          <div className="bg-primary/10 text-primary mb-2 flex h-12 w-12 items-center justify-center rounded-full">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <DialogTitle className="text-xl font-bold">
            Termos de Uso e Privacidade
          </DialogTitle>
          <DialogDescription className="text-center text-sm">
            Para continuar usando a Bewear e garantirmos a conformidade com a
            LGPD, precisamos do seu aceite.
          </DialogDescription>
        </DialogHeader>

        {/* ScrollArea agora tem altura fixa (h-48) para não esticar o modal */}
        <div className="relative my-4 flex-1 overflow-hidden rounded-md border border-slate-200">
          <ScrollArea className="h-48 w-full bg-slate-50/50 p-4 text-sm text-slate-600 shadow-inner">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-slate-900">
                  1. Responsabilidades
                </h3>
                <p className="mt-1">
                  Você é o único responsável pelos produtos e informações
                  cadastradas em sua vitrine. A Bewear fornece a infraestrutura
                  (SaaS) e não se responsabiliza por entregas ou suporte ao
                  consumidor final.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900">
                  2. Pagamentos e Risco
                </h3>
                <p className="mt-1">
                  Transações financeiras são processadas por parceiros. O risco
                  da operação (incluindo fraudes e chargebacks) é de
                  responsabilidade do Lojista.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900">3. LGPD</h3>
                <p className="mt-1">
                  Você atua como Controlador dos dados dos seus clientes. A
                  Bewear atua como Operadora, protegendo as informações na nossa
                  infraestrutura.
                </p>
              </div>
            </div>
          </ScrollArea>
        </div>

        <div className="flex items-start gap-3 rounded-lg border bg-slate-50 p-3">
          <Checkbox
            id="terms"
            checked={isChecked}
            onCheckedChange={(checked) => setIsChecked(checked as boolean)}
            className="mt-0.5 h-5 w-5"
          />
          <label
            htmlFor="terms"
            className="cursor-pointer text-sm leading-snug font-medium text-slate-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Eu li e concordo com os Termos.{" "}
            <Link
              href="/termos"
              target="_blank"
              className="text-primary inline-flex items-center gap-1 font-bold hover:underline"
            >
              Ler completo <ExternalLink className="h-3 w-3" />
            </Link>
          </label>
        </div>

        <DialogFooter className="mt-4 flex-col gap-2 sm:flex-col">
          <Button
            className="h-11 w-full text-base font-semibold"
            disabled={!isChecked || isPending}
            onClick={handleAccept}
          >
            {isPending ? "Confirmando..." : "Confirmar e Continuar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
