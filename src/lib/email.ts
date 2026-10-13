const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";

const SENDER_EMAIL = "nao-responda@bewearshop.com.br";

export interface EmailOrderItem {
  name: string;
  quantity: number;
  priceFormatted: string;
}

const generateItemsTableHtml = (
  items: EmailOrderItem[],
  subtotal: string,
  shipping: string,
  total: string,
  enableOnlinePayments: boolean,
) => {
  const itemsRows = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 10px 5px; border-bottom: 1px solid #eaeaea; color: #555;">${item.name}</td>
      <td style="padding: 10px 5px; border-bottom: 1px solid #eaeaea; text-align: center; color: #555;">${item.quantity}</td>
      <td style="padding: 10px 5px; border-bottom: 1px solid #eaeaea; text-align: right; color: #555;">${item.priceFormatted}</td>
    </tr>
  `,
    )
    .join("");

  const totalLabel = enableOnlinePayments ? "Total Pago:" : "Total a Pagar:";
  const totalColor = enableOnlinePayments ? "#16a34a" : "#d97706";

  return `
    <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
      <thead>
        <tr>
          <th style="text-align: left; padding: 8px 5px; border-bottom: 2px solid #eaeaea; color: #333;">Produto</th>
          <th style="text-align: center; padding: 8px 5px; border-bottom: 2px solid #eaeaea; color: #333;">Qtd</th>
          <th style="text-align: right; padding: 8px 5px; border-bottom: 2px solid #eaeaea; color: #333;">Preço</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="text-align: right; padding: 10px 5px 5px; color: #555;">Subtotal:</td>
          <td style="text-align: right; padding: 10px 5px 5px; color: #555;">${subtotal}</td>
        </tr>
        <tr>
          <td colspan="2" style="text-align: right; padding: 5px; color: #555;">Frete:</td>
          <td style="text-align: right; padding: 5px; color: #555;">${shipping}</td>
        </tr>
        <tr>
          <td colspan="2" style="text-align: right; padding: 10px 5px; font-weight: bold; font-size: 16px; color: #333;">${totalLabel}</td>
          <td style="text-align: right; padding: 10px 5px; font-weight: bold; font-size: 16px; color: ${totalColor};">${total}</td>
        </tr>
      </tfoot>
    </table>
  `;
};

export async function sendCustomerReceiptEmail(
  customerEmail: string,
  customerName: string,
  orderNumber: number,
  storeName: string,
  items: EmailOrderItem[],
  subtotalFormatted: string,
  shippingFormatted: string,
  totalPriceFormatted: string,
  enableOnlinePayments: boolean,
) {
  try {
    const tableHtml = generateItemsTableHtml(
      items,
      subtotalFormatted,
      shippingFormatted,
      totalPriceFormatted,
      enableOnlinePayments,
    );

    const subjectText = enableOnlinePayments
      ? `Confirmação do Pedido #${orderNumber} - ${storeName}`
      : `Pedido Reservado #${orderNumber} - ${storeName}`;

    const introText = enableOnlinePayments
      ? "O seu pagamento foi aprovado e a loja já foi notificada para separar o seu pedido."
      : "O seu pedido foi reservado com sucesso! Lembre-se de entrar em contato com a loja via WhatsApp para finalizar o pagamento e garantir seus produtos.";

    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: `Equipe ${storeName}`, email: SENDER_EMAIL },
        to: [{ email: customerEmail, name: customerName }],
        subject: subjectText,
        htmlContent: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
            <h2 style="color: #333;">Obrigado pela sua preferência, ${customerName.split(" ")[0]}! 🎉</h2>
            <p style="color: #555; line-height: 1.5;">${introText}</p>
            
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; font-weight: bold; color: #333; font-size: 16px;">Resumo do Pedido #${orderNumber}</p>
              ${tableHtml}
            </div>
            
            <p style="color: #555; font-size: 14px;">Você pode acompanhar o status da sua entrega acessando a aba "Meus Pedidos" no nosso site.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Erro Brevo: ${errorData}`);
    }

    console.log(`✅ Email de recibo enviado para o cliente ${customerEmail}`);
  } catch (error) {
    console.error("❌ Erro ao enviar email para o cliente:", error);
  }
}

export async function sendStoreOwnerNotificationEmail(
  ownerEmail: string,
  orderNumber: number,
  storeName: string,
  items: EmailOrderItem[],
  subtotalFormatted: string,
  shippingFormatted: string,
  totalPriceFormatted: string,
  enableOnlinePayments: boolean,
) {
  try {
    const tableHtml = generateItemsTableHtml(
      items,
      subtotalFormatted,
      shippingFormatted,
      totalPriceFormatted,
      enableOnlinePayments,
    );

    const subjectText = enableOnlinePayments
      ? `💰 Nova Venda Realizada! Pedido #${orderNumber}`
      : `🛒 Novo Pedido Reservado! Pedido #${orderNumber}`;

    const titleText = enableOnlinePayments
      ? `Nova Venda na ${storeName}! 🚀`
      : `Novo Pedido na ${storeName}! 🛒`;

    const introText = enableOnlinePayments
      ? "Ótimas notícias! Um cliente acabou de ter o pagamento aprovado."
      : "Ótimas notícias! Um cliente acabou de fazer um pedido e entrará em contato via WhatsApp para pagamento.";

    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Notificações BEWEAR", email: SENDER_EMAIL },
        to: [{ email: ownerEmail }],
        subject: subjectText,
        htmlContent: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px; border-top: 5px solid #8B5CF6;">
            <h2 style="color: #333;">${titleText}</h2>
            <p style="color: #555; line-height: 1.5;">${introText}</p>
            
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; font-weight: bold; color: #333; font-size: 16px;">Detalhes do Pedido #${orderNumber}</p>
              ${tableHtml}
            </div>
            
            <p style="color: #555; font-size: 14px;">Acesse o seu painel Admin para ver os detalhes completos e gerenciar os status.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Erro Brevo: ${errorData}`);
    }

    console.log(`✅ Email de notificação enviado para o lojista ${ownerEmail}`);
  } catch (error) {
    console.error("❌ Erro ao enviar email para o lojista:", error);
  }
}
