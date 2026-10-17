"use client";

import React from "react";
import Image from "next/image";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { orderTable } from "@/db/schema";
import { formatCentsToBRL } from "@/helpers/money";
import { translateOrderStatus } from "@/helpers/orders-status";

import { CancelOrderButton } from "./cancel-order-button";
import { PendingPaymentButton } from "./pending-payment-button";

interface OrdersProps {
  /** A loja recebe pagamento online (só nela o cliente pode cancelar pendentes). */
  onlinePayments: boolean;
  orders: Array<{
    id: string;
    totalPriceInCents: number;
    orderNumber: number | null;
    status: (typeof orderTable.$inferSelect)["status"];
    createdAt: Date;
    paymentProvider: string;
    items: Array<{
      id: string;
      imageUrl: string;
      productName: string;
      productVariantName: string;
      priceInCents: number;
      quantity: number;
    }>;
  }>;
}

const Orders = ({ orders, onlinePayments }: OrdersProps) => {
  function formatOrderNumber(orderNumber: number): string {
    return orderNumber.toString().padStart(4, "0");
  }

  function getBadgeVariant(status: string) {
    switch (status.toLowerCase()) {
      case "pending":
      case "canceled":
      case "cancelled":
        return "destructive";
      case "refunded":
        return "secondary";
      case "processing":
        return "outline";
      default:
        return "default";
    }
  }

  return (
    <div className="space-y-5">
      {orders.map((order) => (
        <Card key={order.id}>
          <CardContent>
            <Accordion type="single" collapsible key={order.id}>
              <AccordionItem value="item-1">
                <AccordionTrigger>
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant={getBadgeVariant(order.status)}>
                      {translateOrderStatus(order.status)}
                    </Badge>

                    <p className="mt-2">Número do pedido</p>
                    <p className="text-accent-foreground text-sm">
                      {order.orderNumber &&
                        `#${formatOrderNumber(order.orderNumber)}`}
                    </p>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-accent-foreground text-sm">
                    Pedido realizado em:{" "}
                    <span className="font-medium">
                      {order.createdAt.toLocaleDateString()} às{" "}
                      {order.createdAt.toLocaleTimeString()}
                    </span>
                  </p>

                  {order.status === "pending" && onlinePayments && (
                    <div className="mt-4 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm">
                        Este pedido ainda aguarda o pagamento.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {order.paymentProvider === "mercadopago" && (
                          <PendingPaymentButton orderId={order.id} />
                        )}
                        <CancelOrderButton orderId={order.id} />
                      </div>
                    </div>
                  )}

                  <Separator className="my-4" />

                  {order.items.map((product, index) => (
                    <React.Fragment key={product.id}>
                      <div className="my-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Image
                            src={product.imageUrl}
                            alt={product.productName}
                            width={78}
                            height={78}
                            className="rounded-lg"
                          />
                          <div className="flex flex-col gap-1">
                            <p className="text-sm font-semibold">
                              {product.productName}
                            </p>
                            <p className="text-muted-foreground text-xs font-medium">
                              {product.productVariantName} x {product.quantity}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end justify-center gap-2">
                          <p className="text-sm font-bold">
                            {formatCentsToBRL(
                              product.priceInCents * product.quantity,
                            )}
                          </p>
                        </div>
                      </div>
                      {index !== order.items.length - 1 && <Separator />}
                    </React.Fragment>
                  ))}

                  <div className="py-5">
                    <Separator />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <p className="text-sm">Subtotal</p>
                      <p className="text-muted-foreground text-sm font-medium">
                        {formatCentsToBRL(order.totalPriceInCents)}
                      </p>
                    </div>
                    <div className="flex justify-between">
                      <p className="text-sm">Frete</p>
                      <p className="text-muted-foreground text-sm font-medium">
                        GRÁTIS
                      </p>
                    </div>
                    <div className="flex justify-between">
                      <p className="text-sm">Total</p>
                      <p className="text-sm font-semibold">
                        {formatCentsToBRL(order.totalPriceInCents)}
                      </p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default Orders;
