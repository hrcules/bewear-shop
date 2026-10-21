CREATE TABLE "mp_checkout" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"source_cart_id" uuid,
	"seller_id" text NOT NULL,
	"live_mode" boolean NOT NULL,
	"preference_id" text,
	"checkout_url" text,
	"status" text DEFAULT 'new' NOT NULL,
	"payment_id" text,
	"last_payment_status" text,
	"review_reason" text,
	"items" jsonb NOT NULL,
	"shipping_in_cents" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mp_checkout_source_cart_id_unique" UNIQUE("source_cart_id"),
	CONSTRAINT "mp_checkout_preference_id_unique" UNIQUE("preference_id"),
	CONSTRAINT "mp_checkout_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "mp_connection" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"live_mode" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mp_email" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mp_oauth_state" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"session_hash" text NOT NULL,
	"verifier_encrypted" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "payment_provider" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "store" ADD COLUMN "checkout_provider" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "store" ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "mp_checkout" ADD CONSTRAINT "mp_checkout_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_checkout" ADD CONSTRAINT "mp_checkout_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_connection" ADD CONSTRAINT "mp_connection_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_email" ADD CONSTRAINT "mp_email_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_oauth_state" ADD CONSTRAINT "mp_oauth_state_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_oauth_state" ADD CONSTRAINT "mp_oauth_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mp_checkout_request_unique" ON "mp_checkout" USING btree ("store_id","user_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "mp_email_recipient_unique" ON "mp_email" USING btree ("order_id","recipient");