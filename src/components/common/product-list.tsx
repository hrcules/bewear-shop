"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";

import {
  categoryTable,
  productTable,
  type productVariantTable,
} from "@/db/schema";

import ProductItem from "./product-item";
import { Button } from "../ui/button";

interface ProductListProps {
  title: string;
  products: (typeof productTable.$inferSelect & {
    variants: (typeof productVariantTable.$inferSelect)[];
    category: typeof categoryTable.$inferSelect;
  })[];
  // Mantido opcional por compatibilidade com quem ainda passa a loja.
  store?: unknown;
}

const ProductList = ({ title, products }: ProductListProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      const firstChild = scrollContainerRef.current.children[0] as HTMLElement;
      if (firstChild) {
        const itemWidth = firstChild.clientWidth + 24;
        scrollContainerRef.current.scrollBy({
          left: -(itemWidth * 3),
          behavior: "smooth",
        });
      }
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      const firstChild = scrollContainerRef.current.children[0] as HTMLElement;
      if (firstChild) {
        const itemWidth = firstChild.clientWidth + 24;
        scrollContainerRef.current.scrollBy({
          left: itemWidth * 3,
          behavior: "smooth",
        });
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 md:px-10">
        <h3 className="text-lg font-semibold md:text-xl">{title}</h3>

        <div className="hidden items-center gap-4 md:flex">
          <div className="flex gap-2">
            <Button
              variant={"ghost"}
              onClick={scrollLeft}
              className="text-muted-foreground hover:bg-muted-foreground hover:text-secondary flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant={"ghost"}
              onClick={scrollRight}
              className="text-muted-foreground hover:bg-muted-foreground hover:text-secondary flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-5 md:px-10">
        <div
          ref={scrollContainerRef}
          className="flex w-full snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-4 md:gap-6 [&::-webkit-scrollbar]:hidden"
        >
          {products.map((product) => (
            <ProductItem
              product={product}
              key={product.id}
              className="max-w-[160px] min-w-[160px] snap-start md:max-w-[280px] md:min-w-[280px]"
              textContainerClassName="w-full"
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const ProductGrid = ({ title, products }: ProductListProps) => {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-5 pb-10 md:px-10">
      <h3 className="text-lg font-semibold md:text-xl">{title}</h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
        {products.map((product) => (
          <ProductItem
            key={product.id}
            product={product}
            textContainerClassName="w-full max-w-none"
          />
        ))}
      </div>
    </div>
  );
};

export { ProductList, ProductGrid };
