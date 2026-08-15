import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import Image from "next/image";
import { notFound } from "next/navigation";

import Header from "@/components/common/header/index";
import { ProductList } from "@/components/common/product-list";
import { db } from "@/db";
import { productTable, productVariantTable } from "@/db/schema";
import { formatCentsToBRL } from "@/helpers/money"; // Importação adicionada para formatar o preço no SEO
import { getTenantStore } from "@/lib/tentat";

import ProductActions from "./components/product-actions";
import VariantSelector from "./components/variant-selector";

interface ProductPageProps {
  params: Promise<{
    storeSlug?: string;
    slug: string;
    productSlug: string;
  }>;
}

// ==========================================
// 🚀 GERAÇÃO DO CARD PARA WHATSAPP / INSTAGRAM
// ==========================================
export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { productSlug } = await params;

  // Busca apenas os dados necessários para o SEO (mais rápido)
  const productVariant = await db.query.productVariantTable.findFirst({
    where: eq(productVariantTable.slug, productSlug),
    with: {
      product: true,
    },
  });

  if (!productVariant) {
    return {
      title: "Produto não encontrado",
    };
  }

  // Formata o preço e monta os textos do Card
  const formattedPrice = formatCentsToBRL(productVariant.priceInCents);
  const ogTitle = `${productVariant.product.name} - ${productVariant.name}`;
  const ogDescription = `Por apenas ${formattedPrice} 🛍️. Confira agora!`;

  return {
    title: ogTitle,
    description: ogDescription,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      images: [
        {
          url: productVariant.imageUrl, // A foto da variação vai aparecer grandona!
          width: 1200,
          height: 630,
          alt: ogTitle,
        },
      ],
      locale: "pt_BR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [productVariant.imageUrl],
    },
  };
}

// ==========================================
// COMPONENTE DA PÁGINA
// ==========================================
const ProductPage = async ({ params }: ProductPageProps) => {
  const { slug, productSlug } = await params;

  const store = await getTenantStore();

  if (!store) {
    return (
      <div className="p-10 text-center font-bold">
        Nenhuma loja configurada no sistema.
      </div>
    );
  }

  const productVariant = await db.query.productVariantTable.findFirst({
    where: eq(productVariantTable.slug, productSlug),
    with: {
      product: {
        with: { variants: true, category: true },
      },
    },
  });

  if (!productVariant || productVariant.product.storeId !== store.id) {
    return notFound();
  }

  const likelyProduct = await db.query.productTable.findMany({
    where: and(
      eq(productTable.categoryId, productVariant.product.categoryId),
      eq(productTable.storeId, store.id),
    ),
    with: { variants: true, category: true },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 pt-6 pb-12">
        <div className="mx-auto w-full max-w-7xl px-5 md:px-10">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-12">
            <div className="flex w-full flex-col">
              <Image
                src={productVariant.imageUrl}
                alt={productVariant.name}
                sizes="(max-width: 768px) 100vw, 50vw"
                width={0}
                height={0}
                className="h-auto w-full rounded-3xl object-cover md:rounded-[32px]"
                priority
              />
            </div>

            <div className="flex flex-col gap-6 md:py-6">
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold md:text-3xl lg:text-4xl">
                  {productVariant.product.name}
                </h1>
                <p className="text-muted-foreground text-sm md:text-base">
                  {productVariant.name}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <VariantSelector
                  currentSlug={productVariant.slug}
                  variants={productVariant.product.variants}
                  categorySlug={slug}
                />
              </div>

              {/* ✅ Passando corretamente as regras e o estado da loja */}
              <ProductActions
                variants={productVariant.product.variants.filter(
                  (v) => v.color === productVariant.color,
                )}
                pixDiscountPercent={store.pixDiscountPercent}
                enableOnlinePayments={store.enableOnlinePayments}
              />

              <div className="mt-2 flex flex-col">
                <p className="text-muted-foreground text-sm leading-relaxed md:text-base">
                  {productVariant.product.description}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-16 md:mt-24">
          <ProductList
            title="Você também pode gostar"
            products={likelyProduct}
          />
        </div>
      </main>
    </div>
  );
};

export default ProductPage;
