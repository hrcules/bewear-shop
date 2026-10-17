ALTER TABLE "mp_checkout" ADD COLUMN "mercado_pago_order_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "mp_checkout_mercado_pago_order_id_unique" ON "mp_checkout" USING btree ("mercado_pago_order_id");
