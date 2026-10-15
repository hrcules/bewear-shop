export const translateOrderStatus = (status: string) => {
  const statusMap: Record<string, string> = {
    pending: "Pendente",
    paid: "Pago",
    processing: "Em Processamento",
    shipped: "Enviado",
    delivered: "Entregue",
    canceled: "Cancelado",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
  };

  return statusMap[status.toLowerCase()] || status;
};
