import type { Metadata } from "next";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import Image from "next/image";

import CategorySelector from "@/components/common/category-selector";
import Header from "@/components/common/header/index";
import { ProductList } from "@/components/common/product-list";
import { db } from "@/db";
import {
  categoryTable,
  orderItemTable,
  orderTable,
  productTable,
  productVariantTable,
} from "@/db/schema";
import { getTenantStore } from "@/lib/tentat";

export async function generateMetadata(): Promise<Metadata> {
  const store = await getTenantStore();

  if (!store) {
    return { title: "Loja não encontrada" };
  }

  const ogTitle = store.name;
  const ogDescription = `Bem-vindo à ${store.name}. Confira nossos produtos e ofertas exclusivas!`;

  const bannerUrl =
    store.banner1DesktopUrl || store.banner1MobileUrl || undefined;

  return {
    title: ogTitle,
    description: ogDescription,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      locale: "pt_BR",
      type: "website",
      ...(bannerUrl && {
        images: [
          {
            url: bannerUrl,
            width: 1200,
            height: 630,
            alt: `Banner da loja ${store.name}`,
          },
        ],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      ...(bannerUrl && { images: [bannerUrl] }),
    },
  };
}

// ==========================================
// COMPONENTE PRINCIPAL DA HOME
// ==========================================
export default async function Home() {
  const store = await getTenantStore();

  if (!store) {
    return (
      <div className="p-10 text-center font-bold">
        Nenhuma loja configurada no sistema.
      </div>
    );
  }

  // ==========================================
  // 1. MAIS VENDIDOS (Com Preenchimento Inteligente)
  // ==========================================

  const bestSellerRecords = await db
    .select({
      productId: productVariantTable.productId,
      totalSold: sql<number>`sum(${orderItemTable.quantity})`.mapWith(Number),
    })
    .from(orderItemTable)
    .innerJoin(orderTable, eq(orderItemTable.orderId, orderTable.id))
    .innerJoin(
      productVariantTable,
      eq(orderItemTable.productVariantId, productVariantTable.id),
    )
    .where(
      and(
        eq(orderTable.storeId, store.id),
        notInArray(orderTable.status, ["pending", "canceled"]),
      ),
    )
    .groupBy(productVariantTable.productId)
    .orderBy(desc(sql<number>`sum(${orderItemTable.quantity})`))
    .limit(12);

  const topProductIds = bestSellerRecords.map((r) => r.productId);

  const realBestSellers =
    topProductIds.length > 0
      ? await db.query.productTable.findMany({
          where: inArray(productTable.id, topProductIds),
          with: { variants: true, category: true },
        })
      : [];

  const orderedBestSellers = topProductIds
    .map((id) => realBestSellers.find((p) => p.id === id))
    .filter(Boolean) as typeof realBestSellers;

  const missingCount = 12 - orderedBestSellers.length;

  let extraProducts: typeof realBestSellers = [];

  if (missingCount > 0) {
    const extraConditions = [eq(productTable.storeId, store.id)];

    if (topProductIds.length > 0) {
      extraConditions.push(notInArray(productTable.id, topProductIds));
    }

    extraProducts = await db.query.productTable.findMany({
      where: and(...extraConditions),
      orderBy: sql`RANDOM()`,
      limit: missingCount,
      with: { variants: true, category: true },
    });
  }

  const bestSellers = [...orderedBestSellers, ...extraProducts];

  // ==========================================
  // 2. NOVOS PRODUTOS (Lançamentos)
  // ==========================================
  const newlyCreatedProducts = await db.query.productTable.findMany({
    where: eq(productTable.storeId, store.id),
    orderBy: [desc(productTable.createdAt)],
    limit: 12,
    with: { variants: true, category: true },
  });

  // ==========================================
  // 3. OFERTAS (Menor preço da loja)
  // ==========================================
  const allStoreProducts = await db.query.productTable.findMany({
    where: eq(productTable.storeId, store.id),
    with: { variants: true, category: true },
  });

  const offersProducts = allStoreProducts
    .map((product) => {
      const prices = product.variants.map((v) => v.priceInCents);
      const lowestPrice = prices.length > 0 ? Math.min(...prices) : Infinity;
      return { ...product, lowestPrice };
    })
    .sort((a, b) => a.lowestPrice - b.lowestPrice)
    .slice(0, 12);

  const categories = await db.query.categoryTable.findMany({
    where: eq(categoryTable.storeId, store.id),
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 space-y-8 pb-12">
        {/* === BANNER PRINCIPAL (CARROSSEL 1) === */}
        {(store.banner1MobileUrl || store.banner1DesktopUrl) && (
          <section className="mx-auto mt-6 w-full max-w-7xl px-5 md:px-10">
            {store.banner1MobileUrl && (
              <Image
                src={store.banner1MobileUrl}
                alt={`Banner Mobile ${store.name}`}
                height={0}
                width={0}
                sizes="100vw"
                className="h-auto w-full rounded-[24px] md:hidden"
                priority
              />
            )}
            {store.banner1DesktopUrl && (
              <Image
                src={store.banner1DesktopUrl}
                alt={`Banner Desktop ${store.name}`}
                height={0}
                width={0}
                sizes="100vw"
                className="hidden h-auto w-full rounded-[32px] md:block"
                priority
              />
            )}
          </section>
        )}

        <ProductList
          products={bestSellers}
          title="Mais vendidos"
          store={store}
        />

        {offersProducts.length > 0 && (
          <ProductList
            products={offersProducts}
            title="Ofertas"
            store={store}
          />
        )}

        <section className="mx-auto w-full max-w-7xl px-5 md:hidden">
          <CategorySelector
            categories={categories}
            storeColor={store.colorPrimary}
          />
        </section>

        {/* === BANNER SECUNDÁRIO (CARROSSEL 2) === */}
        {(store.banner2MobileUrl || store.banner2DesktopUrl) && (
          <section className="mx-auto mt-6 w-full max-w-7xl px-5 md:px-10">
            {store.banner2MobileUrl && (
              <Image
                src={store.banner2MobileUrl}
                alt={`Banner Mobile ${store.name}`}
                height={0}
                width={0}
                sizes="100vw"
                className="h-auto w-full rounded-[24px] md:hidden"
                priority
              />
            )}
            {store.banner2DesktopUrl && (
              <Image
                src={store.banner2DesktopUrl}
                alt={`Banner Desktop ${store.name}`}
                height={0}
                width={0}
                sizes="100vw"
                className="hidden h-auto w-full rounded-[32px] md:block"
                priority
              />
            )}
          </section>
        )}

        <ProductList
          products={newlyCreatedProducts}
          title="Novos produtos"
          store={store}
        />
      </main>
    </div>
  );
}
