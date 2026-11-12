"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp"; // ✅ A Mágica importada aqui no topo!

import { db } from "@/db";
import { categoryTable, productTable, productVariantTable } from "@/db/schema";
import { r2 } from "@/lib/r2";
import { tenantOwnerAction } from "@/lib/safe-action";

export const createProductAction = tenantOwnerAction<
  FormData,
  { success: boolean }
>(async (formData, ctx) => {
  const { storeId } = ctx;

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const categoryId = formData.get("categoryId") as string;

  const priceInput = formData.get("price") as string;
  const color = formData.get("color") as string;
  const size = formData.get("size") as string;
  const stockInput = formData.get("stock") as string;
  const imageFile = formData.get("image") as File | null;

  if (!name || !priceInput || !categoryId || !color || !size) {
    throw new Error("Preencha todos os campos obrigatórios");
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

  const priceInCents = Math.round(
    parseFloat(priceInput.replace(",", ".")) * 100,
  );
  const stock = parseInt(stockInput || "0", 10);

  const productSlug =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-") +
    "-" +
    Date.now();

  const variantSlug =
    `${productSlug}-${color.toLowerCase()}-${size.toLowerCase()}`.replace(
      /[^a-z0-9]+/g,
      "-",
    );

  let imageUrl = "";

  if (imageFile && imageFile.size > 0) {
    const rawBuffer = Buffer.from(await imageFile.arrayBuffer());

    // ✅ O Sharp entra em ação antes do upload!
    const processedBuffer = await sharp(rawBuffer)
      .resize({
        width: 800,
        height: 800,
        fit: "cover",
        position: "center",
      })
      .webp({ quality: 80 })
      .toBuffer();

    // ✅ Extensão .webp forçada e nome limpo
    const fileName = `${storeId}/produtos/${Date.now()}-img.webp`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: fileName,
        Body: processedBuffer, // ✅ Arquivo leve processado
        ContentType: "image/webp", // ✅ Tipo de arquivo atualizado
      }),
    );

    imageUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${fileName}`;
  }

  await db.transaction(async (tx) => {
    const [newProduct] = await tx
      .insert(productTable)
      .values({
        name,
        description,
        slug: productSlug,
        categoryId,
        storeId: storeId,
      })
      .returning();

    await tx.insert(productVariantTable).values({
      productId: newProduct.id,
      name: color,
      slug: variantSlug,
      priceInCents,
      imageUrl,
      color,
      size,
      stock,
    });
  });

  revalidatePath("/admin/products");
  return { success: true };
});
