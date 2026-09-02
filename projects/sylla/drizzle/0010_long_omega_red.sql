CREATE TYPE "public"."debrief_disposition" AS ENUM('skipped', 'quick', 'private_host_conversation');--> statement-breakpoint
CREATE TYPE "public"."outcome_answer" AS ENUM('yes', 'no', 'unsure');--> statement-breakpoint
CREATE TABLE "introduction_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"introduction_proposal_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"met" boolean NOT NULL,
	"worthwhile" "outcome_answer",
	"meet_again" "outcome_answer",
	"already_knew" boolean NOT NULL,
	"would_have_met_without_sylla" "outcome_answer" NOT NULL,
	"contact_exchanged" boolean DEFAULT false NOT NULL,
	"second_interaction_planned" boolean DEFAULT false NOT NULL,
	"wants_another_introduction" boolean DEFAULT false NOT NULL,
	"debrief_disposition" "debrief_disposition" NOT NULL,
	"proposed_memory_count" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_memories" ADD COLUMN "introduction_outcome_id" uuid;--> statement-breakpoint
ALTER TABLE "introduction_outcomes" ADD CONSTRAINT "introduction_outcomes_introduction_proposal_id_introduction_proposals_id_fk" FOREIGN KEY ("introduction_proposal_id") REFERENCES "public"."introduction_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introduction_outcomes" ADD CONSTRAINT "introduction_outcomes_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "introduction_outcomes_proposal_idx" ON "introduction_outcomes" USING btree ("introduction_proposal_id");--> statement-breakpoint
CREATE INDEX "introduction_outcomes_participant_idx" ON "introduction_outcomes" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "introduction_outcomes_proposal_participant_unique" ON "introduction_outcomes" USING btree ("introduction_proposal_id","participant_id");--> statement-breakpoint
ALTER TABLE "personal_memories" ADD CONSTRAINT "personal_memories_introduction_outcome_id_introduction_outcomes_id_fk" FOREIGN KEY ("introduction_outcome_id") REFERENCES "public"."introduction_outcomes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_memories_outcome_idx" ON "personal_memories" USING btree ("introduction_outcome_id");