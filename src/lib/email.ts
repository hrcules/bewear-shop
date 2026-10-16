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

/** Aviso simples ao lojista sobre um problema de pagamento (reembolso, disputa...). */
export async function sendStoreOwnerPaymentAlertEmail(
  ownerEmail: string,
  subject: string,
  title: string,
  message: string,
) {
  try {
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
        subject,
        htmlContent: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px; border-top: 5px solid #d97706;">
            <h2 style="color: #333;">${title}</h2>
            <p style="color: #555; line-height: 1.5;">${message}</p>
            <p style="color: #555; font-size: 14px;">Acesse o seu painel Admin para ver o pedido e, se precisar, o painel do Mercado Pago para os detalhes do pagamento.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Erro Brevo: ${errorData}`);
    }
  } catch (error) {
    console.error("❌ Erro ao enviar aviso de pagamento ao lojista:", error);
  }
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Avisa o cliente de que o valor do pedido foi estornado/reembolsado. */
export async function sendCustomerRefundEmail(
  customerEmail: string,
  customerName: string,
  orderNumber: number,
  storeName: string,
  refundedFormatted: string,
  partial: boolean,
) {
  try {
    const name = escapeHtml(customerName);
    const store = escapeHtml(storeName);
    const title = partial ? "Reembolso parcial realizado" : "Seu pagamento foi estornado";
    const intro = partial
      ? `Fizemos um reembolso parcial de <strong>${refundedFormatted}</strong> referente ao seu pedido <strong>#${orderNumber}</strong> na ${store}.`
      : `O valor de <strong>${refundedFormatted}</strong> referente ao seu pedido <strong>#${orderNumber}</strong> na ${store} foi estornado.`;

    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: storeName, email: SENDER_EMAIL },
        to: [{ email: customerEmail, name: customerName }],
        subject: `${title} — Pedido #${orderNumber}`,
        htmlContent: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px; border-top: 5px solid #8B5CF6;">
            <h2 style="color: #333;">${title}</h2>
            <p style="color: #555; line-height: 1.5;">Olá, ${name}!</p>
            <p style="color: #555; line-height: 1.5;">${intro}</p>
            <p style="color: #555; line-height: 1.5;">O valor volta pelo mesmo meio de pagamento usado na compra. O prazo para aparecer depende do banco ou da operadora do cartão: no Pix costuma ser rápido, e no cartão pode aparecer na fatura seguinte.</p>
            <p style="color: #555; font-size: 14px;">Em caso de dúvidas, entre em contato diretamente com a ${store}.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Erro Brevo: ${errorData}`);
    }
  } catch (error) {
    console.error("❌ Erro ao enviar e-mail de estorno ao cliente:", error);
  }
}

/** Avisa o lojista que a conexão com o Mercado Pago precisa ser refeita. */
export async function sendStoreOwnerReconnectEmail(
  ownerEmail: string,
  storeName: string,
  settingsUrl: string,
) {
  try {
    const store = escapeHtml(storeName);
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
        subject: `⚠️ Reconecte o Mercado Pago da ${storeName}`,
        htmlContent: `
          <div style="background-color: #f4f4f7; padding: 24px 12px; font-family: sans-serif;">
            <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #eaeaea;">
              <div style="background-color: #8B5CF6; padding: 20px 28px;">
                <p style="margin: 0; color: #ffffff; font-size: 13px; letter-spacing: 1px; text-transform: uppercase;">BEWEAR · ${store}</p>
              </div>
              <div style="padding: 28px;">
                <h2 style="margin: 0 0 12px 0; color: #222; font-size: 22px;">Sua conta Mercado Pago precisa ser reconectada</h2>
                <p style="color: #555; line-height: 1.6; margin: 0 0 16px 0;">
                  A autorização que a sua loja deu ao Mercado Pago expirou ou foi revogada.
                  <strong>Enquanto ela não for refeita, seus clientes não conseguem pagar online</strong> na ${store}.
                </p>
                <div style="background-color: #fff7ed; border-left: 4px solid #d97706; padding: 14px 16px; border-radius: 6px; margin: 0 0 22px 0;">
                  <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                    Pedidos já pagos não são afetados. Só novos pagamentos ficam bloqueados até a reconexão.
                  </p>
                </div>
                <p style="color: #555; line-height: 1.6; margin: 0 0 8px 0; font-size: 14px;"><strong>Como resolver (1 minuto):</strong></p>
                <ol style="color: #555; line-height: 1.8; font-size: 14px; padding-left: 20px; margin: 0 0 24px 0;">
                  <li>Abra as configurações da loja no painel Admin.</li>
                  <li>No cartão do Mercado Pago, clique em <strong>Conectar Mercado Pago</strong>.</li>
                  <li>Faça login e autorize. Pronto!</li>
                </ol>
                <div style="text-align: center; margin: 0 0 8px 0;">
                  <a href="${settingsUrl}" style="display: inline-block; background-color: #8B5CF6; color: #ffffff; text-decoration: none; font-weight: bold; padding: 14px 28px; border-radius: 8px; font-size: 15px;">Reconectar agora</a>
                </div>
              </div>
              <div style="padding: 16px 28px; background-color: #fafafa; border-top: 1px solid #eaeaea;">
                <p style="margin: 0; color: #999; font-size: 12px; line-height: 1.5;">Você recebeu este e-mail porque é o responsável pela loja ${store} na BEWEAR. Se o botão não funcionar, copie este endereço: ${settingsUrl}</p>
              </div>
            </div>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Erro Brevo: ${errorData}`);
    }
  } catch (error) {
    console.error("❌ Erro ao enviar aviso de reconexão ao lojista:", error);
  }
}

export type PixPendingEmail = {
  customerEmail: string;
  customerName: string;
  orderNumber: number;
  storeName: string;
  amountFormatted: string;
  expiresLabel: string | null;
  pixCode: string | null;
  ordersUrl: string;
  reminder: boolean;
  /** Agenda o envio (até 72h à frente). `batchId` permite cancelar depois. */
  schedule?: { at: Date; batchId: string };
};

/** E-mail "Pix aguardando pagamento" (imediato) ou o lembrete (agendado). */
export async function sendCustomerPixPendingEmail(input: PixPendingEmail) {
  try {
    const firstName = escapeHtml(input.customerName.split(" ")[0] || "cliente");
    const store = escapeHtml(input.storeName);
    const when = input.expiresLabel
      ? ` O Pix vale até <strong>${escapeHtml(input.expiresLabel)}</strong>; depois disso o pedido é cancelado automaticamente.`
      : "";

    const title = input.reminder
      ? "Seu Pix está perto de expirar"
      : "Seu pedido está aguardando o pagamento";
    const intro = input.reminder
      ? `O Pix do seu Pedido #${input.orderNumber} na ${store}, no valor de <strong>${input.amountFormatted}</strong>, ainda não foi pago.${when}`
      : `Seu Pedido #${input.orderNumber} na ${store} foi reservado e aguarda o pagamento de <strong>${input.amountFormatted}</strong> via Pix.${when}`;
    const subject = input.reminder
      ? `Lembrete: seu Pix do Pedido #${input.orderNumber} está perto de expirar - ${input.storeName}`
      : `Pix aguardando pagamento - Pedido #${input.orderNumber} - ${input.storeName}`;

    const codeBlock = input.pixCode
      ? `<p style="color: #555; line-height: 1.5; margin: 16px 0 6px 0;">Pix copia e cola:</p>
         <div style="background-color: #f9f9f9; border: 1px dashed #cfcfcf; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; color: #333; word-break: break-all;">${escapeHtml(input.pixCode)}</div>`
      : "";

    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: `Equipe ${input.storeName}`, email: SENDER_EMAIL },
        to: [{ email: input.customerEmail, name: input.customerName }],
        subject,
        htmlContent: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px; border-top: 5px solid #8B5CF6;">
            <h2 style="color: #333;">${title}, ${firstName}!</h2>
            <p style="color: #555; line-height: 1.5;">${intro}</p>
            ${codeBlock}
            <div style="text-align: center; margin: 24px 0 8px 0;">
              <a href="${input.ordersUrl}" style="display: inline-block; background-color: #8B5CF6; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 8px; font-size: 15px;">Ver meu pedido e o QR Code</a>
            </div>
            <p style="color: #999; font-size: 12px; line-height: 1.5;">Se você já pagou, pode ignorar este e-mail. A confirmação chega assim que o pagamento for identificado.</p>
          </div>
        `,
        ...(input.schedule
          ? {
              scheduledAt: input.schedule.at.toISOString(),
              batchId: input.schedule.batchId,
            }
          : {}),
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Erro Brevo: ${errorData}`);
    }

    if (input.schedule) {
      console.info("✅ Lembrete de Pix agendado no Brevo", {
        batchId: input.schedule.batchId,
        scheduledFor: input.schedule.at.toISOString(),
        status: response.status,
      });
    }
  } catch (error) {
    console.error("❌ Erro ao enviar e-mail de Pix pendente:", error);
  }
}

/** Cancela um envio agendado (404 = já enviado ou inexistente: tudo bem). */
export async function cancelScheduledEmail(batchId: string) {
  try {
    const response = await fetch(
      `https://api.brevo.com/v3/smtp/email/${encodeURIComponent(batchId)}`,
      { method: "DELETE", headers: { "api-key": BREVO_API_KEY } },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Erro Brevo ${response.status}`);
    }
  } catch (error) {
    console.error("❌ Erro ao cancelar e-mail agendado:", error);
  }
}
