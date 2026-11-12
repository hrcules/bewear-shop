"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { PutObjectCommand } from "@aws-sdk/client-s3";
// ✅ 1. Importando o Sharp
import sharp from "sharp";

import { db } from "@/db";
import { productTable, productVariantTable } from "@/db/schema";
import { r2 } from "@/lib/r2";
import { tenantOwnerAction } from "@/lib/safe-action";

// Retorna { success, error } em vez de lançar erro: em produção o Next esconde
// a mensagem de erros lançados por server actions, e o lojista precisa do motivo.
// A Vercel recusa requisições acima de ~4,5 MB, então o limite fica em 4 MB
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export const createVariantAction = tenantOwnerAction<
  FormData,
  { success: boolean; error?: string }
>(async (formData, ctx) => {
  const { storeId } = ctx;

  const productId = formData.get("productId") as string;
  const priceInput = formData.get("price") as string;
  // ✅ Pegando o novo campo de preço de comparação
  const compareAtPriceInput = formData.get("compareAtPrice") as string | null;
  const stockInput = formData.get("stock") as string;

  const imageFile = formData.get("image") as File | null;
  const previousImageUrl = formData.get("previousImageUrl") as string | null;

  const color = (formData.get("color") as string | null)?.trim() ?? "";
  const size = (formData.get("size") as string | null)?.trim() ?? "";
  const name = color;

  if (!productId) {
    return { success: false, error: "Produto não informado." };
  }

  // Lista todos os campos que faltam de uma vez, para o lojista corrigir tudo
  const missing: string[] = [];
  if (!color) missing.push("Cor");
  if (!size) missing.push("Tamanho");
  if (!priceInput?.trim()) missing.push("Preço");
  if (!stockInput?.trim()) missing.push("Estoque");
  if (!imageFile?.size && !previousImageUrl) missing.push("Imagem");

  if (missing.length > 0) {
    return {
      success: false,
      error: `Não foi possível adicionar a variação: falta preencher ${formatList(missing)}.`,
    };
  }

  const priceInCents = Math.round(
    parseFloat(priceInput.replace(",", ".")) * 100,
  );

  if (!Number.isFinite(priceInCents) || priceInCents <= 0) {
    return {
      success: false,
      error:
        "Não foi possível adicionar a variação: informe um preço maior que zero.",
    };
  }

  const stock = Number(stockInput);
  if (!Number.isInteger(stock) || stock < 0) {
    return {
      success: false,
      error:
        "Não foi possível adicionar a variação: o estoque deve ser um número inteiro, zero ou maior.",
    };
  }

  // ✅ Convertendo o preço de comparação para centavos (se existir)
  let compareAtPriceInCents: number | null = null;
  if (compareAtPriceInput?.trim()) {
    compareAtPriceInCents = Math.round(
      parseFloat(compareAtPriceInput.replace(",", ".")) * 100,
    );
    if (!Number.isFinite(compareAtPriceInCents) || compareAtPriceInCents <= 0) {
      return {
        success: false,
        error:
          'Não foi possível adicionar a variação: o preço "De" é inválido.',
      };
    }
  }

  if (imageFile && imageFile.size > 0) {
    if (!imageFile.type.startsWith("image/")) {
      return {
        success: false,
        error:
          "Não foi possível adicionar a variação: o arquivo enviado não é uma imagem.",
      };
    }
    if (imageFile.size > MAX_IMAGE_BYTES) {
      return {
        success: false,
        error: "Não foi possível adicionar a variação: a imagem passa de 4 MB.",
      };
    }
  }

  const parentProduct = await db.query.productTable.findFirst({
    where: and(
      eq(productTable.id, productId),
      eq(productTable.storeId, storeId),
    ),
    with: { variants: true },
  });

  if (!parentProduct) {
    return {
      success: false,
      error: "Produto inválido ou não pertence a esta loja.",
    };
  }

  // Evita duas variações com a mesma cor e o mesmo tamanho
  const duplicated = parentProduct.variants.some(
    (v) =>
      v.color.trim().toLowerCase() === color.toLowerCase() &&
      v.size.trim().toLowerCase() === size.toLowerCase(),
  );

  if (duplicated) {
    return {
      success: false,
      error: `Não foi possível adicionar a variação: já existe a cor "${color}" no tamanho "${size}" neste produto.`,
    };
  }

  const variantSlug =
    `${parentProduct.slug}-${color.toLowerCase()}-${size.toLowerCase()}`.replace(
      /[^a-z0-9]+/g,
      "-",
    );

  let imageUrl = "";

  if (imageFile && imageFile.size > 0) {
    try {
      const rawBuffer = Buffer.from(await imageFile.arrayBuffer());

      // ✅ 2. A Mágica do Sharp: Corta em 800x800 (quadrado) e converte para WebP
      const processedBuffer = await sharp(rawBuffer)
        .resize({
          width: 800,
          height: 800,
          fit: "cover",
          position: "center",
        })
        .webp({ quality: 80 })
        .toBuffer();

      // ✅ 3. Salvando com a extensão .webp
      const fileName = `${storeId}/produtos/${parentProduct.id}/${Date.now()}-img.webp`;

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: fileName,
          Body: processedBuffer,
          ContentType: "image/webp", // ✅ Tipo de conteúdo atualizado
        }),
      );

      imageUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${fileName}`;
    } catch (error) {
      console.error("[CREATE_VARIANT_IMAGE_ERROR]", error);
      return {
        success: false,
        error:
          "Não foi possível adicionar a variação: falha ao processar ou enviar a imagem. Tente outra foto.",
      };
    }
  } else if (previousImageUrl) {
    imageUrl = previousImageUrl;
  }

  await db.insert(productVariantTable).values({
    productId,
    name,
    color,
    size,
    priceInCents,
    compareAtPriceInCents,
    stock,
    imageUrl,
    slug: variantSlug,
  });

  revalidatePath(`/admin/products/${productId}`);

  return { success: true };
});

function formatList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}
