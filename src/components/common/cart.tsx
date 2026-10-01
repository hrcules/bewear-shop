"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";

import { formatCentsToBRL } from "@/helpers/money";
import { useCart } from "@/hooks/queries/use-cart";

import Image from "next/image";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import CartItem from "./cart-item";

const Cart = () => {
  const { data: cart } = useCart();

  const isCartEmpty = !cart?.items || cart.items.length === 0;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="cursor-pointer" variant="ghost" size="icon">
          <ShoppingBag className="text-accent-foreground" size={24} />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-lg font-semibold">
            <ShoppingBag size={18} className="text-accent-foreground" /> Sacola
          </SheetTitle>
        </SheetHeader>

        <div className="flex h-full flex-col px-5 pb-5">
          {isCartEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
              <div className="bg-muted flex h-24 w-24 items-center justify-center rounded-full">
                <Image
                  src="/empty-cart.png"
                  alt="Sacola vazia"
                  height={0}
                  width={0}
                  sizes="100vw"
                  className="h-auto w-full"
                />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">Sua sacola está vazia</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Parece que você ainda não escolheu nenhum produto. Que tal dar
                  uma olhada nas nossas novidades?
                </p>
              </div>
              <SheetClose asChild>
                <Button className="mt-4 w-full rounded-full" asChild>
                  <Link href="/">Começar a comprar</Link>
                </Button>
              </SheetClose>
            </div>
          ) : (
            <>
              <div className="flex h-full max-h-full flex-col overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="flex h-full flex-col gap-8">
                    {cart.items.map((item) => (
                      <CartItem
                        key={item.id}
                        id={item.id}
                        productName={item.productVariant.product.name}
                        productVariantName={item.productVariant.name}
                        productVariantId={item.productVariant.id}
                        productVariantImageUrl={item.productVariant.imageUrl}
                        productVariantPriceInCents={
                          item.productVariant.priceInCents
                        }
                        productVariantSize={item.productVariant.size}
                        quantity={item.quantity}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="mt-auto flex flex-col gap-4 pt-6">
                <div className="text-accent-foreground flex items-center justify-between text-[14px] font-medium">
                  <p>Subtotal</p>
                  <p>{formatCentsToBRL(cart.totalPriceInCents ?? 0)}</p>
                </div>

                <Separator className="mb-5" />

                <Button className="rounded-full" asChild>
                  <Link href="/cart/identification">Finalizar Compra</Link>
                </Button>
                <SheetClose asChild>
                  <Button variant="ghost" className="rounded-full" asChild>
                    <p className="cursor-pointer font-medium underline">
                      Continuar comprando
                    </p>
                  </Button>
                </SheetClose>
              </div>
            </>
          )}

          {/* <div className="flex h-full max-h-full flex-col overflow-hidden">
            <ScrollArea className="h-full">
              <div className="flex h-full flex-col gap-8">
                {cart?.items.map((item) => (
                  <CartItem
                    key={item.id}
                    id={item.id}
                    productName={item.productVariant.product.name}
                    productVariantName={item.productVariant.name}
                    productVariantId={item.productVariant.id}
                    productVariantImageUrl={item.productVariant.imageUrl}
                    productVariantPriceInCents={
                      item.productVariant.priceInCents
                    }
                    quantity={item.quantity}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          {cart?.items && cart?.items.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="text-accent-foreground flex items-center justify-between text-[14px] font-medium">
                <p>Subtotal</p>
                <p>{formatCentsToBRL(cart?.totalPriceInCents ?? 0)}</p>
              </div>

              <Separator className="mb-5" />

              <Button className="rounded-full" asChild>
                <Link href="/cart/identification">Finalizar Compra</Link>
              </Button>
              <SheetClose asChild>
                <Button variant="ghost" className="rounded-full" asChild>
                  <p className="cursor-pointer font-medium underline">
                    Continuar comprando
                  </p>
                </Button>
              </SheetClose>
            </div>
          )} */}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default Cart;
