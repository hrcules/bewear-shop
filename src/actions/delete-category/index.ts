"use server";

import { eq, and, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { categoryTable, productTable } from "@/db/schema";
import { tenantOwnerAction } from "@/lib/safe-action"; // ✅ Nosso Escudo

// Retorna { success, error } em vez de lançar erro: em produção o Next esconde
// a mensagem de erros lançados por server actions, e o lojista precisa do motivo.
export const deleteCategory = tenantOwnerAction<
  string,
  { success: boolean; error?: string }
>(async (categoryId, ctx) => {
  // 🛡️ Pegamos o ID da loja blindado
  const { storeId } = ctx;

  const category = await db.query.categoryTable.findFirst({
    where: and(
      eq(categoryTable.id, categoryId),
      eq(categoryTable.storeId, storeId),
    ),
  });

  if (!category) {
    return { success: false, error: "Categoria não encontrada." };
  }

  // ✅ Usamos o storeId do contexto para contar
  const categoriesCount = await db
    .select({ value: count() })
    .from(categoryTable)
    .where(eq(categoryTable.storeId, storeId));

  if (categoriesCount[0].value <= 1) {
    return {
      success: false,
      error: "Sua loja precisa ter pelo menos uma categoria ativa.",
    };
  }

  // Categoria com produtos não pode ser excluída (o produto ficaria sem categoria)
  const productsCount = await db
    .select({ value: count() })
    .from(productTable)
    .where(
      and(
        eq(productTable.categoryId, categoryId),
        eq(productTable.storeId, storeId),
      ),
    );

  const total = productsCount[0].value;

  if (total > 0) {
    return {
      success: false,
      error: `Não é possível excluir "${category.name}": ela tem ${total} ${
        total === 1 ? "produto vinculado" : "produtos vinculados"
      }. Mova ${total === 1 ? "o produto" : "os produtos"} para outra categoria antes de excluir.`,
    };
  }

  // ✅ Usamos o storeId do contexto para deletar com segurança extrema
  await db
    .delete(categoryTable)
    .where(
      and(eq(categoryTable.id, categoryId), eq(categoryTable.storeId, storeId)),
    );

  revalidatePath("/admin/categories");

  return { success: true };
});
