"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { productTable, productVariantTable } from "@/db/schema";
import { tenantOwnerAction } from "@/lib/safe-action";

export const deleteVariantAction = tenantOwnerAction<
  { variantId: string; productId: string },
  { success: boolean; error?: string }
>(async ({ variantId, productId }, ctx) => {
  const { storeId } = ctx;

  const parentProduct = await db.query.productTable.findFirst({
    where: and(
      eq(productTable.id, productId),
      eq(productTable.storeId, storeId),
    ),
  });

  if (!parentProduct || parentProduct.storeId !== storeId) {
    throw new Error("Produto inválido ou sem permissão.");
  }

  try {
    const deleted = await db
      .delete(productVariantTable)
      .where(
        and(
          eq(productVariantTable.id, variantId),
          eq(productVariantTable.productId, parentProduct.id),
        ),
      )
      .returning({ id: productVariantTable.id });

    if (deleted.length === 0) {
      return { success: false, error: "Variação não encontrada." };
    }

    revalidatePath(`/admin/products/${productId}`);

    return { success: true };
  } catch (error: unknown) {
    const dbError = error as { code?: string };

    if (dbError.code === "23503") {
      return {
        success: false,
        error:
          "Esta variação não pode ser excluída pois já faz parte de pedidos realizados por seus clientes. Para manter seu histórico financeiro intacto, recomendamos desativá-la por enquanto. Já estamos trabalhando em uma solução de arquivamento definitivo para as próximas atualizações!",
      };
    }

    return {
      success: false,
      error: "Ocorreu um erro inesperado ao tentar excluir a variante.",
    };
  }
});
