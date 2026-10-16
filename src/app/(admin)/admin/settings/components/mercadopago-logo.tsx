"use client";

import { CreditCard } from "lucide-react";
import { useState } from "react";

// Logo oficial em public/brands/mercadopago.svg (versão horizontal, já com o
// nome). Se o arquivo não carregar, mostramos ícone + texto como reserva.
export function MercadoPagoLogo() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="flex items-center gap-2">
        <CreditCard className="h-5 w-5" aria-hidden />
        Mercado Pago
      </span>
    );
  }

  return (
    // Fundo branco no tema escuro: o nome da marca é azul-escuro.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brands/mercadopago.svg"
      alt="Mercado Pago"
      className="h-9 w-auto dark:rounded-md dark:bg-white dark:px-2"
      onError={() => setFailed(true)}
    />
  );
}
