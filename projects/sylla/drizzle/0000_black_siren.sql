CREATE TYPE "public"."event_status" AS ENUM('draft', 'open', 'matching', 'complete', 'archived');--> statement-breakpoint
CREATE TYPE "public"."memory_status" AS ENUM('proposed', 'approved', 'edited', 'forgotten');--> statement-breakpoint
CREATE TYPE "public"."observation_origin" AS ENUM('observed', 'inferred', 'told_to_me');--> statement-breakpoint
CREATE TYPE "public"."observation_status" AS ENUM('pending', 'confirmed', 'edited', 'forgotten');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('invited', 'onboarding', 'ready', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('private', 'shareable');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('unprovisioned', 'starting', 'ready', 'paused', 'destroyed', 'failed');--> statement-breakpoint
CREATE TABLE "agent_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"solari_desktop_session_id" text,
	"status" "workspace_status" DEFAULT 'unprovisioned' NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"destroyed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "approved_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"venue" text,
	"starts_at" timestamp with time zone,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"source_id" uuid,
	"claim" text NOT NULL,
	"evidence_excerpt" text,
	"origin" "observation_origin" NOT NULL,
	"status" "observation_status" DEFAULT 'pending' NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"confidence" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"invite_token_hash" text NOT NULL,
	"display_name" text,
	"intent" text,
	"age_confirmed" boolean DEFAULT false NOT NULL,
	"status" "participant_status" DEFAULT 'invited' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "personal_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"status" "memory_status" DEFAULT 'proposed' NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"approved_at" timestamp with time zone,
	"forgotten_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"source_observation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_workspaces" ADD CONSTRAINT "agent_workspaces_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approved_sources" ADD CONSTRAINT "approved_sources_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_source_id_approved_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."approved_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_memories" ADD CONSTRAINT "personal_memories_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_artifacts" ADD CONSTRAINT "workspace_artifacts_workspace_id_agent_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."agent_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_workspaces_participant_unique" ON "agent_workspaces" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "approved_sources_participant_idx" ON "approved_sources" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_unique" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "observations_participant_idx" ON "observations" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "participants_event_idx" ON "participants" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_invite_token_unique" ON "participants" USING btree ("invite_token_hash");--> statement-breakpoint
CREATE INDEX "personal_memories_participant_idx" ON "personal_memories" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "workspace_artifacts_workspace_idx" ON "workspace_artifacts" USING btree ("workspace_id");