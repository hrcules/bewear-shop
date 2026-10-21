const BRANDS: Record<string, string> = {
  visa: "Visa",
  master: "Mastercard",
  elo: "Elo",
  amex: "American Express",
  hipercard: "Hipercard",
  diners: "Diners",
  cabal: "Cabal",
  debvisa: "Visa",
  debmaster: "Mastercard",
  debelo: "Elo",
};

/** Ex.: "Pix", "Cartão de crédito Visa em 3x", "Cartão de débito Elo". */
export function paymentMethodLabel(
  typeId: string | null,
  methodId: string | null,
  installments: number | null,
) {
  if (!typeId && !methodId) return null;
  if (methodId === "pix") return "Pix";
  if (typeId === "account_money") return "Saldo Mercado Pago";
  if (typeId === "ticket") return "Boleto";

  const brand = methodId ? (BRANDS[methodId] ?? methodId.toUpperCase()) : "";
  if (typeId === "credit_card") {
    const parcels = installments && installments > 1 ? ` em ${installments}x` : "";
    return `Cartão de crédito ${brand}${parcels}`.replace(/\s+/g, " ").trim();
  }
  if (typeId === "debit_card") return `Cartão de débito ${brand}`.trim();
  return brand || typeId;
}

const PAYMENT_STATUS: Record<string, string> = {
  pending: "Aguardando pagamento",
  in_process: "Em análise",
  approved: "Aprovado",
  rejected: "Recusado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  charged_back: "Chargeback",
  in_mediation: "Em disputa",
};

export function paymentStatusLabel(status: string | null) {
  if (!status) return null;
  return PAYMENT_STATUS[status] ?? status;
}
