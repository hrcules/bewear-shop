"use client";

import { MinusIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatCentsToBRL } from "@/helpers/money";

import AddToCartButton from "./add-to-cart-button";

interface Variant {
  id: string;
  name: string;
  color: string;
  size: string;
  stock: number;
  priceInCents: number;
  compareAtPriceInCents?: number | null;
}

interface ProductActionsProps {
  variants: Variant[];
}

const ProductActions = ({ variants }: ProductActionsProps) => {
  const params = useParams();
  const pathname = usePathname();
  const storeSlug = params.storeSlug as string;

  const basePath =
    storeSlug && pathname.startsWith(`/store/${storeSlug}`)
      ? `/store/${storeSlug}`
      : "";

  const availableSizes = Array.from(new Set(variants.map((v) => v.size)));

  const [selectedSize, setSelectedSize] = useState(
    availableSizes[0] || "Único",
  );
  const [quantity, setQuantity] = useState(1);

  const currentVariant = variants.find((v) => v.size === selectedSize);

  const maxStock = currentVariant?.stock || 0;
  const isOutOfStock = maxStock === 0;

  const originalPrice = currentVariant?.priceInCents || 0;
  const compareAtPrice = currentVariant?.compareAtPriceInCents || 0;
  const hasComparePrice = compareAtPrice > originalPrice;

  useEffect(() => {
    if (quantity > maxStock && maxStock > 0) {
      setQuantity(maxStock);
    }
  }, [currentVariant, maxStock, quantity]);

  const handleDecrement = () => {
    setQuantity((prev) => (prev > 1 ? prev - 1 : prev));
  };

  const handleIncrement = () => {
    if (quantity < maxStock) {
      setQuantity((prev) => prev + 1);
    }
  };

  const checkoutHref = `${basePath}/cart/identification?variantId=${currentVariant?.id}&quantity=${quantity}`;

  return (
    <div className="space-y-6">
      {/* ✅ Bloco de Preços Organizado Verticalmente */}
      <div>
        {currentVariant ? (
            <div className="flex flex-col gap-1">
              {hasComparePrice && (
                <span className="text-muted-foreground text-lg font-medium line-through">
                  {formatCentsToBRL(compareAtPrice)}
                </span>
              )}
              <p className="text-primary text-4xl font-extrabold">
                {formatCentsToBRL(originalPrice)}
              </p>
            </div>
        ) : (
          <p className="text-4xl font-bold">R$ --</p>
        )}
      </div>

      <div className="space-y-6">
        {availableSizes.length > 0 && availableSizes[0] !== "Único" && (
          <div className="space-y-3">
            <h3 className="font-medium">
              Tamanho:{" "}
              <span className="text-muted-foreground font-normal">
                {selectedSize}
              </span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {availableSizes.map((size) => (
                <button
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                    selectedSize === size
                      ? "border-primary bg-primary/5 ring-primary"
                      : "border-muted-foreground/25 hover:border-primary/50"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <h3 className="font-medium">Quantidade</h3>
            {maxStock > 0 && maxStock <= 5 && (
              <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-500">
                Restam apenas {maxStock}!
              </span>
            )}
          </div>
          <div className="flex w-[120px] items-center justify-between rounded-lg border">
            <Button
              size="icon"
              variant="ghost"
              onClick={handleDecrement}
              disabled={isOutOfStock || quantity <= 1}
            >
              <MinusIcon className="h-4 w-4" />
            </Button>
            <p className="font-medium">{isOutOfStock ? 0 : quantity}</p>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleIncrement}
              disabled={isOutOfStock || quantity >= maxStock}
            >
              <PlusIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col space-y-4 px-5 pt-2">
        {currentVariant && !isOutOfStock ? (
          <>
            <AddToCartButton
              productVariantId={currentVariant.id}
              quantity={quantity}
            />
            <Button
              className="rounded-full"
              size="lg"
              asChild
              variant="default"
            >
              <Link href={checkoutHref}>Comprar agora</Link>
            </Button>
          </>
        ) : (
          <Button
            className="cursor-not-allowed rounded-full opacity-50"
            size="lg"
            disabled
            variant="secondary"
          >
            {currentVariant ? "Esgotado" : "Tamanho Indisponível"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ProductActions;
