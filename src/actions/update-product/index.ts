"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { categoryTable, productTable } from "@/db/schema";
import { tenantOwnerAction } from "@/lib/safe-action"; // ✅ O Escudo

export const updateProductDetailsAction = tenantOwnerAction<
  FormData, // Tipo do Input
  { success: boolean } // Tipo do Retorno
>(async (formData, ctx) => {
  const { storeId } = ctx;

  const productId = formData.get("productId") as string;
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const categoryId = formData.get("categoryId") as string;

  if (!productId || !name || !categoryId) {
    throw new Error("Preencha todos os campos obrigatórios.");
  }

  const product = await db.query.productTable.findFirst({
    where: eq(productTable.id, productId),
  });

  // 🛡️ Segurança extra
  if (!product || product.storeId !== storeId) {
    throw new Error("Produto inválido ou sem permissão.");
  }

  // 🛡️ A categoria precisa ser desta loja
  const category = await db.query.categoryTable.findFirst({
    where: and(
      eq(categoryTable.id, categoryId),
      eq(categoryTable.storeId, storeId),
    ),
  });

  if (!category) {
    throw new Error("Categoria inválida ou sem permissão.");
  }

  await db
    .update(productTable)
    .set({
      name,
      description,
      categoryId,
      updatedAt: new Date(),
    })
    .where(
      and(eq(productTable.id, productId), eq(productTable.storeId, storeId)),
    );

  revalidatePath(`/admin/products/${productId}`);

  return { success: true };
});
