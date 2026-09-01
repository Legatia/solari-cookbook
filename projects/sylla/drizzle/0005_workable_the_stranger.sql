CREATE TYPE "public"."agent_run_status" AS ENUM('host_orchestrated', 'waiting_for_host', 'fallback_running', 'completed', 'canceled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."orchestration_mode" AS ENUM('host_orchestrated', 'deterministic_background', 'internal_fallback');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"host_run_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"purpose" text NOT NULL,
	"approved_task_type" text NOT NULL,
	"approved_scope" jsonb NOT NULL,
	"status" "agent_run_status" DEFAULT 'host_orchestrated' NOT NULL,
	"execution_mode" "orchestration_mode" DEFAULT 'host_orchestrated' NOT NULL,
	"background_continuation_allowed" boolean DEFAULT false NOT NULL,
	"fallback_budget_credits" integer DEFAULT 0 NOT NULL,
	"fallback_credits_used" integer DEFAULT 0 NOT NULL,
	"checkpoint_sequence" integer DEFAULT 0 NOT NULL,
	"last_host_client_id" text NOT NULL,
	"fallback_reason" text,
	"fallback_claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "run_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"resumable_state" jsonb NOT NULL,
	"created_by" "orchestration_mode" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"checkpoint_id" uuid,
	"from_mode" "orchestration_mode" NOT NULL,
	"to_mode" "orchestration_mode" NOT NULL,
	"reason" text NOT NULL,
	"summary" text NOT NULL,
	"details" jsonb NOT NULL,
	"claimed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_sylla_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sylla_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_personal_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."personal_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_checkpoints" ADD CONSTRAINT "run_checkpoints_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_handoffs" ADD CONSTRAINT "run_handoffs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_handoffs" ADD CONSTRAINT "run_handoffs_checkpoint_id_run_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."run_checkpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_agent_idx" ON "agent_runs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_runs_participant_idx" ON "agent_runs" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_participant_idempotency_unique" ON "agent_runs" USING btree ("participant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "run_checkpoints_run_idx" ON "run_checkpoints" USING btree ("agent_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "run_checkpoints_run_sequence_unique" ON "run_checkpoints" USING btree ("agent_run_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "run_handoffs_run_unique" ON "run_handoffs" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "run_handoffs_checkpoint_idx" ON "run_handoffs" USING btree ("checkpoint_id");