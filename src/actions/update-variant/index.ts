"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { db } from "@/db";
import { productVariantTable } from "@/db/schema";
import { r2 } from "@/lib/r2";
import { tenantOwnerAction } from "@/lib/safe-action"; // ✅ O Escudo

// ✅ Adicionado o compareAtPriceInCents na tipagem
interface updateDataProps {
  name: string;
  color: string;
  size: string;
  priceInCents: number;
  compareAtPriceInCents: number | null;
  stock: number;
  updatedAt: Date;
  imageUrl?: string;
}

export const updateVariantAction = tenantOwnerAction<
  FormData,
  { success: boolean }
>(async (formData, ctx) => {
  const { storeId } = ctx;

  const variantId = formData.get("variantId") as string;
  const productId = formData.get("productId") as string;
  const color = formData.get("color") as string;
  const size = formData.get("size") as string;
  const priceInput = formData.get("price") as string;
  // ✅ Pegando o novo campo de preço de comparação
  const compareAtPriceInput = formData.get("compareAtPrice") as string | null;
  const stockInput = formData.get("stock") as string;
  const imageFile = formData.get("image") as File | null;

  if (!variantId || !productId || !color || !size || !priceInput) {
    throw new Error("Preencha todos os campos obrigatórios.");
  }

  // 🛡️ A variante precisa existir, ser deste produto e o produto ser desta loja
  const existingVariant = await db.query.productVariantTable.findFirst({
    where: and(
      eq(productVariantTable.id, variantId),
      eq(productVariantTable.productId, productId),
    ),
    with: { product: true },
  });

  if (!existingVariant || existingVariant.product.storeId !== storeId) {
    throw new Error("Variação inválida ou sem permissão.");
  }

  const priceInCents = Math.round(
    parseFloat(priceInput.replace(",", ".")) * 100,
  );

  // ✅ Convertendo o preço de comparação para centavos (se existir)
  let compareAtPriceInCents: number | null = null;
  if (compareAtPriceInput) {
    compareAtPriceInCents = Math.round(
      parseFloat(compareAtPriceInput.replace(",", ".")) * 100,
    );
  }

  const stock = parseInt(stockInput || "0", 10);

  const updateData: updateDataProps = {
    name: color,
    color,
    size,
    priceInCents,
    compareAtPriceInCents, // ✅ Atualizando o valor (ou resetando para null se foi apagado)
    stock,
    updatedAt: new Date(),
  };

  if (imageFile && imageFile.size > 0) {
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    const fileName = `${storeId}/produtos/${Date.now()}-${imageFile.name.replace(/[^a-zA-Z0-9.-]/g, "")}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: fileName,
        Body: buffer,
        ContentType: imageFile.type,
      }),
    );
    updateData.imageUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${fileName}`;
  }

  await db
    .update(productVariantTable)
    .set(updateData)
    .where(
      and(
        eq(productVariantTable.id, variantId),
        eq(productVariantTable.productId, productId),
      ),
    );

  revalidatePath(`/admin/products/${productId}`);
  return { success: true };
});
