"use client";

import { CreditCard } from "lucide-react";
import { useState } from "react";

// Símbolo da marca em public/brands/mercadopago.svg (só o desenho, sem o
// nome). Se o arquivo não carregar, mostramos o ícone genérico como reserva.
export function MercadoPagoLogo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <CreditCard className={className} aria-hidden />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brands/mercadopago.svg"
      alt=""
      aria-hidden
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
