CREATE TYPE "public"."candidate_pair_status" AS ENUM('shortlisted', 'evaluating', 'recommended', 'rejected', 'expired', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."directional_evaluation_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."matching_run_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "candidate_pairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"matching_run_id" uuid,
	"participant_low_id" uuid NOT NULL,
	"participant_high_id" uuid NOT NULL,
	"status" "candidate_pair_status" DEFAULT 'shortlisted' NOT NULL,
	"retrieval_evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directional_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_pair_id" uuid NOT NULL,
	"subject_participant_id" uuid NOT NULL,
	"candidate_participant_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "directional_evaluation_status" DEFAULT 'running' NOT NULL,
	"orchestrator" text NOT NULL,
	"provider" text,
	"policy_version" text NOT NULL,
	"subject_observation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"candidate_observation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "matching_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "matching_run_status" DEFAULT 'pending' NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_participant_id" uuid NOT NULL,
	"blocked_participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_pairs" ADD CONSTRAINT "candidate_pairs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_pairs" ADD CONSTRAINT "candidate_pairs_matching_run_id_matching_runs_id_fk" FOREIGN KEY ("matching_run_id") REFERENCES "public"."matching_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_pairs" ADD CONSTRAINT "candidate_pairs_participant_low_id_participants_id_fk" FOREIGN KEY ("participant_low_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_pairs" ADD CONSTRAINT "candidate_pairs_participant_high_id_participants_id_fk" FOREIGN KEY ("participant_high_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directional_evaluations" ADD CONSTRAINT "directional_evaluations_candidate_pair_id_candidate_pairs_id_fk" FOREIGN KEY ("candidate_pair_id") REFERENCES "public"."candidate_pairs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directional_evaluations" ADD CONSTRAINT "directional_evaluations_subject_participant_id_participants_id_fk" FOREIGN KEY ("subject_participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directional_evaluations" ADD CONSTRAINT "directional_evaluations_candidate_participant_id_participants_id_fk" FOREIGN KEY ("candidate_participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matching_runs" ADD CONSTRAINT "matching_runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_blocks" ADD CONSTRAINT "participant_blocks_blocker_participant_id_participants_id_fk" FOREIGN KEY ("blocker_participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_blocks" ADD CONSTRAINT "participant_blocks_blocked_participant_id_participants_id_fk" FOREIGN KEY ("blocked_participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_pairs_event_idx" ON "candidate_pairs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "candidate_pairs_low_idx" ON "candidate_pairs" USING btree ("participant_low_id");--> statement-breakpoint
CREATE INDEX "candidate_pairs_high_idx" ON "candidate_pairs" USING btree ("participant_high_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_pairs_event_participants_unique" ON "candidate_pairs" USING btree ("event_id","participant_low_id","participant_high_id");--> statement-breakpoint
CREATE INDEX "directional_evaluations_pair_idx" ON "directional_evaluations" USING btree ("candidate_pair_id");--> statement-breakpoint
CREATE INDEX "directional_evaluations_subject_idx" ON "directional_evaluations" USING btree ("subject_participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "directional_evaluations_pair_subject_unique" ON "directional_evaluations" USING btree ("candidate_pair_id","subject_participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "directional_evaluations_idempotency_unique" ON "directional_evaluations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "matching_runs_event_idx" ON "matching_runs" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matching_runs_event_idempotency_unique" ON "matching_runs" USING btree ("event_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "participant_blocks_blocker_idx" ON "participant_blocks" USING btree ("blocker_participant_id");--> statement-breakpoint
CREATE INDEX "participant_blocks_blocked_idx" ON "participant_blocks" USING btree ("blocked_participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_blocks_pair_unique" ON "participant_blocks" USING btree ("blocker_participant_id","blocked_participant_id");