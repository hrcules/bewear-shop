"use server";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  cartItemTable,
  cartTable,
  notificationTable,
  orderItemTable,
  orderTable,
  productVariantTable,
  storeTable,
  user,
} from "@/db/schema";

import { calculateShipping } from "@/helpers/shipping";
import { authenticatedAction } from "@/lib/safe-action";

import { formatCentsToBRL } from "@/helpers/money";
import {
  sendCustomerReceiptEmail,
  sendStoreOwnerNotificationEmail,
} from "@/lib/email";

export const finishOrder = authenticatedAction<void, { orderId: string }>(
  async (_, ctx) => {
    const { userId, storeId } = ctx;

    // =========================================================
    // 1. BUSCA O CARRINHO
    // =========================================================

    const cart = await db.query.cartTable.findFirst({
      where: and(eq(cartTable.userId, userId), eq(cartTable.storeId, storeId)),
      with: {
        shippingAddress: true,
        items: {
          with: {
            productVariant: {
              with: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!cart) {
      throw new Error("Cart not found");
    }

    if (!cart.shippingAddress) {
      throw new Error("Shipping address not found");
    }

    if (cart.items.length === 0) {
      throw new Error("O carrinho está vazio.");
    }

    // =========================================================
    // 2. VALIDAÇÕES DO CARRINHO
    // =========================================================

    for (const item of cart.items) {
      // Quantidade precisa ser positiva e inteira
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error(
          `Quantidade inválida para "${item.productVariant.product.name}".`,
        );
      }

      // A variante precisa pertencer à loja atual
      if (item.productVariant.product.storeId !== storeId) {
        throw new Error(
          `O produto "${item.productVariant.product.name}" não pertence a esta loja.`,
        );
      }

      /**
       * Esta validação é apenas uma verificação antecipada
       * para fornecer uma mensagem melhor ao usuário.
       *
       * Ela NÃO protege contra concorrência.
       *
       * A proteção real acontece dentro da transação através
       * do UPDATE condicional:
       *
       * WHERE stock >= quantity
       */
      if (item.productVariant.stock < item.quantity) {
        throw new Error(
          `Estoque insuficiente para "${item.productVariant.product.name}". Temos apenas ${item.productVariant.stock} unidades.`,
        );
      }
    }

    // =========================================================
    // 3. ORDEM ESTÁVEL DAS VARIANTES
    // =========================================================

    /**
     * Processamos sempre as variantes na mesma ordem.
     *
     * Isso reduz a possibilidade de deadlocks quando duas
     * compras disputam várias variantes simultaneamente.
     */
    const sortedItems = [...cart.items].sort((a, b) =>
      a.productVariant.id.localeCompare(b.productVariant.id),
    );

    // =========================================================
    // 4. BUSCA A LOJA
    // =========================================================

    const store = await db.query.storeTable.findFirst({
      where: eq(storeTable.id, storeId),
    });

    if (!store) {
      throw new Error("Loja não encontrada");
    }

    // =========================================================
    // 5. CALCULA VALORES
    // =========================================================

    const subtotalInCents = cart.items.reduce(
      (acc, item) => acc + item.productVariant.priceInCents * item.quantity,
      0,
    );

    const shippingInCents = calculateShipping(
      subtotalInCents,
      store.fixedShippingFeeInCents || 0,
      store.freeShippingThresholdInCents || null,
    );

    const totalPriceInCents = subtotalInCents + shippingInCents;

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
     * Tudo abaixo precisa acontecer de forma atômica:
     *
     * 1. Bloquear o carrinho
     * 2. Criar pedido
     * 3. Criar itens
     * 4. Reservar estoque
     * 5. Limpar carrinho
     *
     * Qualquer erro executa ROLLBACK de tudo.
     */

    await db.transaction(async (tx) => {
      if (!cart.shippingAddress) {
        throw new Error("Shipping address not found");
      }

      // =======================================================
      // 7.1 BLOQUEIA O CARRINHO
      // =======================================================

      /**
       * SELECT FOR UPDATE
       *
       * Impede duas requisições concorrentes de finalizarem
       * o mesmo carrinho.
       *
       * Exemplo:
       *
       * Request A -> pega o lock
       * Request B -> espera
       *
       * A cria pedido e remove carrinho.
       * A executa COMMIT.
       *
       * B continua e não encontra mais o carrinho.
       * Portanto B não cria outro pedido.
       */

      const lockedCart = await tx.execute(sql`
        SELECT id
        FROM ${cartTable}
        WHERE ${cartTable.id} = ${cart.id}
          AND ${cartTable.userId} = ${userId}
          AND ${cartTable.storeId} = ${storeId}
        FOR UPDATE
      `);

      if (lockedCart.rows.length === 0) {
        throw new Error(
          "Este carrinho já foi finalizado ou não está mais disponível.",
        );
      }

      // =======================================================
      // 7.2 CRIA O PEDIDO
      // =======================================================

      const [order] = await tx
        .insert(orderTable)
        .values({
          orderNumber,
          storeId,
          userId,
          totalPriceInCents,
          shippingAddressId: cart.shippingAddress.id,
          status: "pending",
          stripeCheckoutSessionId: "",
        })
        .returning();

      if (!order) {
        throw new Error("Failed to create order");
      }

      orderId = order.id;

      // =======================================================
      // 7.3 CRIA OS ITENS DO PEDIDO
      // =======================================================

      const orderItemsPayload: Array<typeof orderItemTable.$inferInsert> =
        cart.items.map((item) => ({
          orderId: order.id,
          productVariantId: item.productVariant.id,
          quantity: item.quantity,
          priceInCents: item.productVariant.priceInCents,
        }));

      await tx.insert(orderItemTable).values(orderItemsPayload);

      // =======================================================
      // 7.4 RESERVA O ESTOQUE
      // =======================================================

      /**
       * A proteção REAL contra overselling está aqui.
       *
       * O banco só realiza o UPDATE caso ainda exista
       * estoque suficiente naquele exato instante.
       *
       * Isso elimina o race condition:
       *
       * estoque = 1
       *
       * Compra A -> UPDATE -> estoque 0
       *
       * Compra B -> WHERE stock >= 1 falha
       *
       * Portanto somente uma compra consegue reservar.
       */

      for (const item of sortedItems) {
        const updatedVariants = await tx
          .update(productVariantTable)
          .set({
            stock: sql`
              ${productVariantTable.stock} - ${item.quantity}
            `,
          })
          .where(
            and(
              eq(productVariantTable.id, item.productVariant.id),
              sql`
                ${productVariantTable.stock} >= ${item.quantity}
              `,
            ),
          )
          .returning({
            id: productVariantTable.id,
          });

        // =====================================================
        // ESTOQUE ACABOU DURANTE A COMPRA
        // =====================================================

        if (updatedVariants.length === 0) {
          /**
           * Ao lançar o erro:
           *
           * - pedido é removido
           * - itens são removidos
           * - descontos anteriores são revertidos
           * - carrinho permanece
           *
           * porque toda a operação está dentro da mesma
           * transaction.
           */

          throw new Error(
            `Estoque insuficiente para "${item.productVariant.product.name}". O produto acabou de esgotar ou a quantidade solicitada não está mais disponível.`,
          );
        }
      }

      // =======================================================
      // 7.5 LIMPA OS ITENS DO CARRINHO
      // =======================================================

      await tx.delete(cartItemTable).where(eq(cartItemTable.cartId, cart.id));

      // =======================================================
      // 7.6 CONSOME O CARRINHO
      // =======================================================

      /**
       * O carrinho somente é removido depois que:
       *
       * - pedido foi criado
       * - itens foram criados
       * - TODOS os estoques foram reservados
       *
       * Se qualquer etapa falhar, esta operação nunca
       * será confirmada.
       */

      await tx.delete(cartTable).where(eq(cartTable.id, cart.id));
    });

    // =========================================================
    // 8. GARANTIA DO PEDIDO
    // =========================================================

    if (!orderId) {
      throw new Error("Failed to create order");
    }

    // =========================================================
    // 9. E-MAILS E NOTIFICAÇÕES
    // =========================================================

    /**
     * IMPORTANTE:
     *
     * E-mails ficam FORA da transaction.
     *
     * Dessa forma uma transaction que sofreu rollback
     * nunca dispara confirmação de pedido.
     */

    if (!store.enableOnlinePayments) {
      try {
        // =====================================================
        // BUSCA O DONO DA LOJA
        // =====================================================

        const owner = await db.query.user.findFirst({
          where: eq(user.id, store.ownerId),
        });

        // =====================================================
        // FORMATA ITENS
        // =====================================================

        const formattedItems = cart.items.map((item) => ({
          name: `${item.productVariant.product.name} (${item.productVariant.name})`,
          quantity: item.quantity,
          priceFormatted: formatCentsToBRL(
            item.productVariant.priceInCents * item.quantity,
          ),
        }));

        const formattedSubtotal = formatCentsToBRL(subtotalInCents);

        const formattedShipping = formatCentsToBRL(shippingInCents);

        const formattedTotal = formatCentsToBRL(totalPriceInCents);

        // =====================================================
        // 9.1 E-MAIL PARA CLIENTE
        // =====================================================

        await sendCustomerReceiptEmail(
          cart.shippingAddress.email,
          cart.shippingAddress.fullName,
          orderNumber,
          store.name,
          formattedItems,
          formattedSubtotal,
          formattedShipping,
          formattedTotal,
          store.enableOnlinePayments,
        );

        // =====================================================
        // 9.2 E-MAIL PARA LOJISTA
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
          // 9.3 NOTIFICAÇÃO DO PAINEL
          // ===================================================

          await db.insert(notificationTable).values({
            userId: owner.id,
            title: "🛍️ Novo Pedido Recebido (Catálogo)!",
            message: `O pedido #${orderNumber} no valor de ${formattedTotal} acabou de ser realizado através do carrinho.`,
            type: "sale",
          });
        }
      } catch (emailError) {
        /**
         * Falha no e-mail NÃO desfaz o pedido.
         *
         * Neste momento a compra já foi confirmada
         * pelo banco.
         */

        console.error(
          "❌ Erro ao enviar e-mails de notificação (Carrinho):",
          emailError,
        );
      }
    }

    // =========================================================
    // 10. RETORNO
    // =========================================================

    return {
      orderId,
    };
  },
);
