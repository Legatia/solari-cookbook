CREATE TYPE "public"."audit_actor_type" AS ENUM('participant', 'organizer', 'system');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"participant_id" uuid,
	"actor_type" "audit_actor_type" NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"policy_version" text NOT NULL,
	"age_confirmed" boolean NOT NULL,
	"public_source_research" boolean NOT NULL,
	"private_memory_storage" boolean NOT NULL,
	"matchmaking" boolean NOT NULL,
	"host_data_boundary" boolean NOT NULL,
	"background_continuation" boolean DEFAULT false NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "invitation_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_windows" ADD CONSTRAINT "availability_windows_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_consents" ADD CONSTRAINT "participant_consents_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_event_idx" ON "audit_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "audit_events_participant_idx" ON "audit_events" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "availability_windows_participant_idx" ON "availability_windows" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "availability_windows_range_idx" ON "availability_windows" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "event_invitations_event_idx" ON "event_invitations" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_invitations_token_unique" ON "event_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "participant_consents_participant_idx" ON "participant_consents" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_consents_version_unique" ON "participant_consents" USING btree ("participant_id","policy_version");--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_invitation_id_event_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."event_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participants_invitation_idx" ON "participants" USING btree ("invitation_id");