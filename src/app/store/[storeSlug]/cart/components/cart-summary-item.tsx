import Image from "next/image";

import { formatCentsToBRL } from "@/helpers/money";

interface CartSummaryItemProps {
  id: string;
  name: string;
  variantName: string;
  quantity: number;
  priceInCents: number;
  imageUrl: string;
}

export default function CartSummaryItem({
  id,
  name,
  variantName,
  imageUrl,
  quantity,
  priceInCents,
}: CartSummaryItemProps) {
  
  return (
    <>
      <div className="flex items-center justify-between" key={id}>
        <div className="flex items-center gap-4">
          <Image
            src={imageUrl}
            alt={name}
            width={78}
            height={78}
            className="rounded-lg"
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold">{name}</p>
            <p className="text-muted-foreground text-xs font-medium">
              {variantName} | M | {quantity}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end justify-center gap-2">
          <p className="text-sm font-bold">{formatCentsToBRL(priceInCents)}</p>
        </div>
      </div>
    </>
  );
}
