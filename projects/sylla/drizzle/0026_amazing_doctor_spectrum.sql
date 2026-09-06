ALTER TABLE "entitlements" ADD COLUMN "tier_key" text DEFAULT 'resident' NOT NULL;--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "provider_subscription_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_subscription_unique" ON "entitlements" USING btree ("provider_subscription_id");