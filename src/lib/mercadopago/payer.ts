type PayerSource = {
  email: string;
  fullName: string;
  cpf: string;
  phone: string;
  zipCode: string;
  address: string;
  number: string;
};

const digits = (value: string) => value.replace(/\D/g, "");

/**
 * Dados do comprador para a preferência do Mercado Pago. Só envia o que está
 * válido: dado malformado é omitido, nunca inventado. Pré-preenche o checkout
 * e ajuda a análise de risco (taxa de aprovação).
 */
export function buildPayer(source: PayerSource) {
  const parts = source.fullName.trim().split(/\s+/).filter(Boolean);
  const name = parts[0];
  const surname = parts.slice(1).join(" ");

  // Telefone BR: DDD (2) + número (8 ou 9). Aceita prefixo 55.
  let phoneDigits = digits(source.phone);
  if (phoneDigits.length >= 12 && phoneDigits.startsWith("55")) {
    phoneDigits = phoneDigits.slice(2);
  }
  const phone =
    phoneDigits.length === 10 || phoneDigits.length === 11
      ? { area_code: phoneDigits.slice(0, 2), number: phoneDigits.slice(2) }
      : undefined;

  const cpf = digits(source.cpf);
  const zip = digits(source.zipCode);
  const streetNumber = digits(source.number);
  const street = source.address.trim();

  return {
    email: source.email.trim(),
    ...(name ? { name } : {}),
    ...(surname ? { surname } : {}),
    ...(phone ? { phone } : {}),
    ...(cpf.length === 11
      ? { identification: { type: "CPF", number: cpf } }
      : {}),
    ...(zip.length === 8 && street
      ? {
          address: {
            zip_code: zip,
            street_name: street.slice(0, 100),
            ...(streetNumber ? { street_number: streetNumber } : {}),
          },
        }
      : {}),
  };
}
