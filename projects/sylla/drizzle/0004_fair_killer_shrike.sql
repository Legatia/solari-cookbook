CREATE TYPE "public"."checkout_status" AS ENUM('pending', 'completed', 'expired', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."entitlement_status" AS ENUM('trialing', 'active', 'inactive', 'exhausted', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."usage_status" AS ENUM('reserved', 'settled', 'released', 'declined');--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_hash" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"plan_key" text DEFAULT 'starter' NOT NULL,
	"status" "checkout_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_key" text DEFAULT 'starter-trial' NOT NULL,
	"status" "entitlement_status" DEFAULT 'trialing' NOT NULL,
	"credit_limit" integer DEFAULT 500 NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"credits_reserved" integer DEFAULT 0 NOT NULL,
	"period_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"period_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"owner_client_id" text NOT NULL,
	"owner_run_id" text NOT NULL,
	"lease_token_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"estimated_credits" integer NOT NULL,
	"actual_credits" integer,
	"status" "usage_status" DEFAULT 'reserved' NOT NULL,
	"provider" text DEFAULT 'solari' NOT NULL,
	"provider_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_user_id_sylla_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sylla_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_user_id_sylla_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sylla_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_sylla_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sylla_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_leases" ADD CONSTRAINT "runtime_leases_agent_id_personal_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."personal_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_leases" ADD CONSTRAINT "runtime_leases_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_user_id_sylla_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sylla_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_agent_id_personal_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."personal_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_provider_event_unique" ON "billing_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "checkout_sessions_user_idx" ON "checkout_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_sessions_token_unique" ON "checkout_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_user_unique" ON "entitlements" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_leases_agent_unique" ON "runtime_leases" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_leases_token_unique" ON "runtime_leases" USING btree ("lease_token_hash");--> statement-breakpoint
CREATE INDEX "runtime_leases_participant_idx" ON "runtime_leases" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "usage_ledger_user_idx" ON "usage_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_ledger_agent_idx" ON "usage_ledger" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_ledger_idempotency_unique" ON "usage_ledger" USING btree ("idempotency_key");