"use client";

import { CreditCard } from "lucide-react";
import { useState } from "react";

// Coloque o arquivo oficial da marca em public/brands/mercadopago.svg
// (baixe no kit de marca do Mercado Pago). Enquanto ele não existir, o card
// mostra o ícone genérico, então nada quebra.
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
