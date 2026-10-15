import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCentsToBRL } from "@/helpers/money";

interface CartSummaryProps {
  subtotalInCents: number;
  freteInCents: number;
  totalInCents: number;
  products: Array<{
    id: string;
    name: string;
    variantName: string;
    quantity: number;
    priceInCents: number;
    imageUrl: string;
  }>;
}

const CartSummary = ({
  subtotalInCents,
  freteInCents,
  totalInCents,
  products,
}: CartSummaryProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumo do pedido</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Linhas de valores simples e limpas */}
        <div className="space-y-2 text-sm">
          <div className="text-muted-foreground flex justify-between">
            <p>Subtotal</p>
            <p>{formatCentsToBRL(subtotalInCents)}</p>
          </div>
          <div className="text-muted-foreground flex justify-between">
            <p>Frete</p>
            <p>
              {freteInCents === 0 ? "Grátis" : formatCentsToBRL(freteInCents)}
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Total</p>
          <p className="text-lg font-bold">{formatCentsToBRL(totalInCents)}</p>
        </div>

        {/* ... (resto dos itens) */}
      </CardContent>
    </Card>
  );
};

export default CartSummary;
