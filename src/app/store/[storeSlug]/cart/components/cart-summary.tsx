import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCentsToBRL } from "@/helpers/money";

interface CartSummaryProps {
  subtotalInCents: number;
  freteInCents: number;
  totalInCents: number;
  pixDiscountPercent?: number; // ✅ NOVO: Recebendo a porcentagem
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
  pixDiscountPercent = 0,
  products,
}: CartSummaryProps) => {
  const pixDiscountAmount =
    pixDiscountPercent > 0
      ? Math.round((subtotalInCents * pixDiscountPercent) / 100)
      : 0;
  const pixTotalInCents = subtotalInCents - pixDiscountAmount + freteInCents;

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

        {/* Aqui está o pulo do gato: Apenas duas linhas claras */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Total no Cartão</p>
            <p className="text-muted-foreground text-sm">
              {formatCentsToBRL(totalInCents)}
            </p>
          </div>

          {pixDiscountPercent > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-emerald-600">
                Total no PIX ({pixDiscountPercent}% desc.)
              </p>
              <p className="text-lg font-bold text-emerald-600">
                {formatCentsToBRL(pixTotalInCents)}
              </p>
            </div>
          )}
        </div>

        {/* ... (resto dos itens) */}
      </CardContent>
    </Card>
  );
};

export default CartSummary;
