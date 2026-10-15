"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import type {
  categoryTable,
  productTable,
  productVariantTable,
} from "@/db/schema";
import { formatCentsToBRL } from "@/helpers/money";
import { cn } from "@/lib/utils";

// ✅ Atualizamos a tipagem para incluir o preço original
type ProductVariant = typeof productVariantTable.$inferSelect & {
  compareAtPriceInCents?: number | null;
};

interface ProductItemProps {
  product: typeof productTable.$inferSelect & {
    variants: ProductVariant[];
    category: typeof categoryTable.$inferSelect;
  };
  textContainerClassName?: string;
  className?: string;
}

const ProductItem = ({
  product,
  textContainerClassName,
  className,
}: ProductItemProps) => {
  const params = useParams();
  const pathname = usePathname();
  const storeSlug = params.storeSlug as string;

  const basePath =
    storeSlug && pathname.startsWith(`/store/${storeSlug}`)
      ? `/store/${storeSlug}`
      : "";

  const firstVariant = product.variants[0];

  if (!firstVariant) return null;

  const originalPrice = firstVariant.priceInCents;
  const compareAtPrice = firstVariant.compareAtPriceInCents;
  const hasPromo = compareAtPrice && compareAtPrice > originalPrice;

  return (
    <Link
      href={`${basePath}/category/${product.category.slug}/${firstVariant.slug}`}
      className={cn("group flex flex-col gap-3", className)}
    >
      <div className="bg-muted relative mx-auto aspect-square w-[92%] overflow-hidden rounded-[20px] md:rounded-[28px]">
        <Image
          src={firstVariant.imageUrl}
          alt={firstVariant.name}
          fill
          sizes="(max-width: 768px) 160px, 280px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      <div
        className={cn(
          "flex w-full flex-col gap-1 px-2",
          textContainerClassName,
        )}
      >
        <p className="text-foreground truncate text-base font-semibold md:text-lg">
          {product.name}
        </p>

        <p className="text-muted-foreground truncate text-sm font-medium">
          {product.description}
        </p>

        <div className="mt-0.5 flex flex-col">
          {/* ✅ 1. Mostra o valor riscado (se estiver em promoção) */}
          {hasPromo && (
            <span className="text-muted-foreground text-xs line-through">
              {formatCentsToBRL(compareAtPrice)}
            </span>
          )}

          {/* ✅ 2. Mostra o preço oficial de venda */}
          <p className="text-primary truncate text-lg font-extrabold md:text-xl">
            {formatCentsToBRL(originalPrice)}
          </p>
        </div>
      </div>
    </Link>
  );
};

export default ProductItem;
