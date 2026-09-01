CREATE TYPE "public"."introduction_decision" AS ENUM('accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."introduction_proposal_status" AS ENUM('waiting', 'matched', 'declined', 'expired', 'canceled', 'completed');--> statement-breakpoint
CREATE TABLE "disclosure_envelopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_pair_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"observation_ids" jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "introduction_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_pair_id" uuid NOT NULL,
	"status" "introduction_proposal_status" DEFAULT 'waiting' NOT NULL,
	"meeting_area" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"matched_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "introduction_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"introduction_proposal_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"decision" "introduction_decision" NOT NULL,
	"block_requested" boolean DEFAULT false NOT NULL,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runtime_leases" ADD COLUMN "owner_kind" text DEFAULT 'host' NOT NULL;--> statement-breakpoint
ALTER TABLE "disclosure_envelopes" ADD CONSTRAINT "disclosure_envelopes_candidate_pair_id_candidate_pairs_id_fk" FOREIGN KEY ("candidate_pair_id") REFERENCES "public"."candidate_pairs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosure_envelopes" ADD CONSTRAINT "disclosure_envelopes_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introduction_proposals" ADD CONSTRAINT "introduction_proposals_candidate_pair_id_candidate_pairs_id_fk" FOREIGN KEY ("candidate_pair_id") REFERENCES "public"."candidate_pairs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introduction_responses" ADD CONSTRAINT "introduction_responses_introduction_proposal_id_introduction_proposals_id_fk" FOREIGN KEY ("introduction_proposal_id") REFERENCES "public"."introduction_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introduction_responses" ADD CONSTRAINT "introduction_responses_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disclosure_envelopes_pair_idx" ON "disclosure_envelopes" USING btree ("candidate_pair_id");--> statement-breakpoint
CREATE INDEX "disclosure_envelopes_participant_idx" ON "disclosure_envelopes" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disclosure_envelopes_pair_participant_unique" ON "disclosure_envelopes" USING btree ("candidate_pair_id","participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "introduction_proposals_pair_unique" ON "introduction_proposals" USING btree ("candidate_pair_id");--> statement-breakpoint
CREATE INDEX "introduction_proposals_status_idx" ON "introduction_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "introduction_responses_proposal_idx" ON "introduction_responses" USING btree ("introduction_proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "introduction_responses_proposal_participant_unique" ON "introduction_responses" USING btree ("introduction_proposal_id","participant_id");