"use server";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  notificationTable,
  orderItemTable,
  orderTable,
  productVariantTable,
  shippingAddressTable,
  storeTable,
  user,
} from "@/db/schema";

import { calculateShipping } from "@/helpers/shipping";
import { authenticatedAction } from "@/lib/safe-action";
import { createDirectOrderSchema } from "./schema";

import { formatCentsToBRL } from "@/helpers/money";
import {
  sendCustomerReceiptEmail,
  sendStoreOwnerNotificationEmail,
} from "@/lib/email";

export const createDirectOrder = authenticatedAction<
  unknown,
  { orderId: string }
>(async (input, ctx) => {
  const { userId, storeId } = ctx;

  // =========================================================
  // 1. VALIDA INPUT
  // =========================================================

  const parsedInput = createDirectOrderSchema.parse(input);

  const { variantId, quantity, addressId } = parsedInput;

  // Proteção adicional no servidor.
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(
      "Quantidade inválida. A quantidade deve ser um número inteiro maior que zero.",
    );
  }

  // =========================================================
  // 2. BUSCA A VARIANTE
  // =========================================================

  const variant = await db.query.productVariantTable.findFirst({
    where: eq(productVariantTable.id, variantId),
    with: {
      product: true,
    },
  });

  if (!variant || variant.product.storeId !== storeId) {
    throw new Error(
      "Bad Request: Variante de produto não encontrada nesta loja.",
    );
  }

  /**
   * Esta verificação serve apenas para fornecer uma resposta
   * antecipada ao usuário.
   *
   * Ela NÃO é responsável por proteger o estoque contra
   * concorrência.
   *
   * A proteção real acontece dentro da transaction através
   * do UPDATE condicional.
   */
  if (variant.stock < quantity) {
    throw new Error(
      `Estoque insuficiente. Temos apenas ${variant.stock} unidades disponíveis.`,
    );
  }

  // =========================================================
  // 3. BUSCA A LOJA
  // =========================================================

  const store = await db.query.storeTable.findFirst({
    where: eq(storeTable.id, storeId),
  });

  if (!store) {
    throw new Error("Internal Server Error: Loja não encontrada.");
  }

  // =========================================================
  // 4. BUSCA E VALIDA O ENDEREÇO
  // =========================================================

  const address = await db.query.shippingAddressTable.findFirst({
    where: eq(shippingAddressTable.id, addressId),
  });

  if (!address || address.userId !== userId) {
    throw new Error(
      "Bad Request: Endereço inválido ou não pertence ao usuário.",
    );
  }

  // =========================================================
  // 5. CALCULA OS VALORES
  // =========================================================

  const subtotalInCents = variant.priceInCents * quantity;

  const shippingInCents = calculateShipping(
    subtotalInCents,
    store.fixedShippingFeeInCents || 0,
    store.freeShippingThresholdInCents || null,
  );

  const totalInCents = subtotalInCents + shippingInCents;

  // =========================================================
  // 6. GERA NÚMERO DO PEDIDO
  // =========================================================

  const timestamp = Date.now();

  const randomSuffix = Math.floor(Math.random() * 1000);

  const orderNumber = Number(`${timestamp}${randomSuffix}`.slice(-9));

  let orderId: string | undefined;

  // =========================================================
  // 7. TRANSAÇÃO
  // =========================================================

  /**
   * Pedido + item + reserva de estoque precisam acontecer
   * na MESMA transação.
   *
   * Se qualquer uma dessas operações falhar:
   *
   * - pedido é desfeito;
   * - item é desfeito;
   * - estoque é restaurado;
   *
   * Nada parcial permanece no banco.
   */

  try {
    await db.transaction(async (tx) => {
      // =====================================================
      // 7.1 RESERVA O ESTOQUE
      // =====================================================

      /**
       * Esta é a proteção real contra overselling.
       *
       * O próprio PostgreSQL verifica se ainda existe estoque
       * suficiente no instante do UPDATE.
       *
       * Exemplo:
       *
       * estoque = 1
       *
       * Compra A:
       * UPDATE stock = stock - 1
       * WHERE stock >= 1
       *
       * Resultado:
       * estoque = 0
       *
       * Compra B:
       * UPDATE stock = stock - 1
       * WHERE stock >= 1
       *
       * A condição falha.
       *
       * Resultado:
       * nenhuma linha atualizada.
       */

      const updatedVariants = await tx
        .update(productVariantTable)
        .set({
          stock: sql`
            ${productVariantTable.stock} - ${quantity}
          `,
        })
        .where(
          and(
            eq(productVariantTable.id, variant.id),
            sql`
              ${productVariantTable.stock} >= ${quantity}
            `,
          ),
        )
        .returning({
          id: productVariantTable.id,
        });

      // =====================================================
      // 7.2 ESTOQUE NÃO ESTAVA MAIS DISPONÍVEL
      // =====================================================

      if (updatedVariants.length === 0) {
        throw new Error(
          `Estoque insuficiente para "${variant.product.name}". O produto acabou de esgotar ou a quantidade solicitada não está mais disponível.`,
        );
      }

      // =====================================================
      // 7.3 CRIA O PEDIDO
      // =====================================================

      const [order] = await tx
        .insert(orderTable)
        .values({
          orderNumber,
          storeId,
          userId,
          shippingAddressId: addressId,
          totalPriceInCents: totalInCents,
          status: "pending",
          stripeCheckoutSessionId: "",
        })
        .returning();

      if (!order) {
        throw new Error("Falha ao criar o pedido.");
      }

      // =====================================================
      // 7.4 CRIA O ITEM DO PEDIDO
      // =====================================================

      await tx.insert(orderItemTable).values({
        orderId: order.id,
        productVariantId: variant.id,
        quantity,
        priceInCents: variant.priceInCents,
      });

      orderId = order.id;

      /**
       * Somente chegando até aqui a transaction poderá
       * executar COMMIT.
       *
       * Qualquer throw acima executará ROLLBACK.
       */
    });
  } catch (error) {
    console.error("Erro ao criar pedido direto:", error);

    /**
     * IMPORTANTE:
     *
     * Não transformamos erros conhecidos de estoque em uma
     * mensagem genérica.
     *
     * Isso permite que o comprador saiba exatamente por que
     * a compra foi recusada.
     */

    if (error instanceof Error) {
      if (error.message.includes("Estoque insuficiente")) {
        throw error;
      }

      if (error.message.includes("Quantidade inválida")) {
        throw error;
      }
    }

    throw new Error("Internal Server Error: Falha ao processar o pedido.");
  }

  // =========================================================
  // 8. GARANTE QUE O PEDIDO FOI CRIADO
  // =========================================================

  if (!orderId) {
    throw new Error("Internal Server Error: Falha ao processar o pedido.");
  }

  // =========================================================
  // 9. E-MAILS E NOTIFICAÇÕES
  // =========================================================

  /**
   * IMPORTANTE:
   *
   * Tudo relacionado a comunicação fica FORA da transaction.
   *
   * Isso garante que:
   *
   * transaction falhou
   *          ↓
   *       rollback
   *          ↓
   * nenhum e-mail é enviado
   *
   *
   * transaction confirmou
   *          ↓
   *        commit
   *          ↓
   * envia e-mail/notificação
   */

  if (!store.enableOnlinePayments) {
    try {
      // =====================================================
      // 9.1 BUSCA O LOJISTA
      // =====================================================

      const owner = await db.query.user.findFirst({
        where: eq(user.id, store.ownerId),
      });

      // =====================================================
      // 9.2 FORMATA OS ITENS
      // =====================================================

      const formattedItems = [
        {
          name: `${variant.product.name} (${variant.name})`,

          quantity,

          priceFormatted: formatCentsToBRL(variant.priceInCents * quantity),
        },
      ];

      const formattedSubtotal = formatCentsToBRL(subtotalInCents);

      const formattedShipping = formatCentsToBRL(shippingInCents);

      const formattedTotal = formatCentsToBRL(totalInCents);

      // =====================================================
      // 9.3 E-MAIL DO CLIENTE
      // =====================================================

      await sendCustomerReceiptEmail(
        address.email,
        address.fullName,
        orderNumber,
        store.name,
        formattedItems,
        formattedSubtotal,
        formattedShipping,
        formattedTotal,
        store.enableOnlinePayments,
      );

      // =====================================================
      // 9.4 E-MAIL DO LOJISTA
      // =====================================================

      if (owner && owner.email) {
        await sendStoreOwnerNotificationEmail(
          owner.email,
          orderNumber,
          store.name,
          formattedItems,
          formattedSubtotal,
          formattedShipping,
          formattedTotal,
          store.enableOnlinePayments,
        );

        // ===================================================
        // 9.5 NOTIFICAÇÃO NO PAINEL
        // ===================================================

        await db.insert(notificationTable).values({
          userId: owner.id,

          title: "🛍️ Novo Pedido Recebido (Catálogo)!",

          message:
            `O pedido #${orderNumber} no valor de ${formattedTotal} ` +
            "acabou de ser realizado. Aguarde o pagamento direto pelo cliente.",

          type: "sale",
        });
      }
    } catch (emailError) {
      /**
       * O pedido já foi confirmado.
       *
       * Portanto uma falha de e-mail NÃO deve desfazer
       * a compra.
       */

      console.error("❌ Erro ao enviar e-mails de notificação:", emailError);
    }
  }

  // =========================================================
  // 10. RETORNO
  // =========================================================

  return {
    orderId,
  };
});
