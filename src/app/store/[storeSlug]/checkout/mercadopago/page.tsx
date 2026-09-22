import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ClearAttempt } from "./clear-attempt";
import Link from "next/link";
import { z } from "zod";
import { db } from "@/db";
import { mpCheckoutTable, orderTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getTenantStore } from "@/lib/tentat";
import Header from "@/components/common/header";
import { formatCentsToBRL } from "@/helpers/money";
export default async function MercadoPagoReturn({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  const store = await getTenantStore();
  if (!session || !store || !z.string().uuid().safeParse(orderId).success)
    redirect("/");
  const order = await db.query.orderTable.findFirst({
    where: and(
      eq(orderTable.id, orderId!),
      eq(orderTable.userId, session.user.id),
      eq(orderTable.storeId, store.id),
    ),
  });
  if (!order) redirect("/");
  const checkout = await db.query.mpCheckoutTable.findFirst({
    where: eq(mpCheckoutTable.orderId, order.id),
  });
  const paid = ["paid", "processing", "shipped", "delivered"].includes(
    order.status,
  );
  const cancelled = order.status === "cancelled";
  return (
    <>
      <Header />
      {checkout && (paid || order.status === "cancelled") && (
        <ClearAttempt requestKey={checkout.requestKey} />
      )}
      <main className="mx-auto max-w-xl space-y-5 p-8">
        <h1 className="text-2xl font-bold">
          {cancelled
            ? "Pedido cancelado"
            : paid
              ? "Pagamento confirmado"
              : "Acompanhe seu pagamento"}
        </h1>
        <p>
          Pedido #{order.orderNumber} ·{" "}
          {formatCentsToBRL(order.totalPriceInCents)}
        </p>
        <p>
          {cancelled
            ? "A reserva deste pedido foi cancelada. Para comprar novamente, inicie um novo pedido."
            : paid
              ? "A loja recebeu a confirmação do seu pagamento."
              : "A confirmação pode levar alguns instantes. Consulte o status antes de realizar outro pagamento."}
        </p>
        {checkout?.reviewReason && (
          <p>
            Este pagamento precisa de verificação pela loja. Não faça outro
            pagamento para o mesmo pedido.
          </p>
        )}
        {!paid &&
          !checkout?.reviewReason &&
          checkout?.checkoutUrl &&
          checkout.expiresAt > new Date() && (
            <a className="block underline" href={checkout.checkoutUrl}>
              Continuar pagamento no Mercado Pago
            </a>
          )}
        <a className="block underline" href={`?orderId=${order.id}`}>
          Atualizar status
        </a>
        <Link className="block underline" href="/orders">
          Meus pedidos
        </Link>
      </main>
    </>
  );
}
