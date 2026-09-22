import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import Header from "@/components/common/header/index";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { productVariantTable, shippingAddressTable } from "@/db/schema";
import { auth } from "@/lib/auth";

import CartSummary from "../components/cart-summary";
import { formatAddress } from "../helpers/address";
import FinishOrderButton from "./components/finish-order-button";
import CartSteper from "../components/cart-steper";

// Helper de Frete
import { calculateShipping } from "@/helpers/shipping";
import { getTenantStore } from "@/lib/tentat";

interface ConfirmationPageProps {
  searchParams: Promise<{
    variantId?: string;
    quantity?: string;
    addressId?: string;
  }>;
}

const ConfirmationPage = async ({ searchParams }: ConfirmationPageProps) => {
  const { variantId, quantity, addressId } = await searchParams;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user.id) {
    redirect("/");
  }

  const store = await getTenantStore();
  if (!store) redirect("/");

  let products = [];
  let subtotalInCents = 0;
  let shippingAddress = null;

  if (variantId && quantity && addressId) {
    const variant = await db.query.productVariantTable.findFirst({
      where: eq(productVariantTable.id, variantId),
      with: { product: true },
    });

    const address = await db.query.shippingAddressTable.findFirst({
      where: eq(shippingAddressTable.id, addressId),
    });

    if (
      !variant ||
      variant.product.storeId !== store.id ||
      !address ||
      address.userId !== session.user.id ||
      !Number.isSafeInteger(Number(quantity)) ||
      Number(quantity) <= 0
    ) {
      redirect("/");
    }

    products = [
      {
        id: variant.id,
        name: variant.product.name,
        variantName: variant.name,
        quantity: Number(quantity),
        priceInCents: variant.priceInCents,
        imageUrl: variant.imageUrl,
      },
    ];
    subtotalInCents = variant.priceInCents * Number(quantity);
    shippingAddress = address;
  } else {
    const cart = await db.query.cartTable.findFirst({
      where: (cart) =>
        and(eq(cart.userId, session.user.id), eq(cart.storeId, store.id)),
      with: {
        shippingAddress: true,
        items: {
          with: {
            productVariant: {
              with: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!cart || cart?.items.length === 0 || !cart.shippingAddress) {
      redirect("/cart/identification");
    }

    products = cart.items.map((item) => ({
      id: item.productVariant.id,
      name: item.productVariant.product.name,
      variantName: item.productVariant.name,
      quantity: item.quantity,
      priceInCents: item.productVariant.priceInCents,
      imageUrl: item.productVariant.imageUrl,
    }));
    subtotalInCents = cart.items.reduce(
      (acc, item) => acc + item.productVariant.priceInCents * item.quantity,
      0,
    );
    shippingAddress = cart.shippingAddress;
  }

  // Caso o atributo não esteja definido por fallback, assume true
  const enableOnlinePayments = store?.enableOnlinePayments ?? true;

  const freteInCents = calculateShipping(
    subtotalInCents,
    store?.fixedShippingFeeInCents || 0,
    store?.freeShippingThresholdInCents || null,
  );

  const totalInCents = subtotalInCents + freteInCents;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 pt-6 pb-12">
        <div className="mx-auto w-full max-w-7xl space-y-6 px-5 md:px-10">
          <CartSteper />

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Identificação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm">{formatAddress(shippingAddress)}</p>
                  </CardContent>
                </Card>
                <FinishOrderButton
                  variantId={variantId}
                  quantity={quantity ? Number(quantity) : undefined}
                  addressId={addressId}
                  enableOnlinePayments={enableOnlinePayments}
                  checkoutProvider={store.checkoutProvider}
                />
              </CardContent>
            </Card>

            <CartSummary
              subtotalInCents={subtotalInCents}
              freteInCents={freteInCents}
              totalInCents={totalInCents}
              products={products}
              pixDiscountPercent={
                enableOnlinePayments ? store?.pixDiscountPercent || 0 : 0
              }
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default ConfirmationPage;
