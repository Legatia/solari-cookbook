CREATE TYPE "public"."introduction_origin_tier" AS ENUM('mutual', 'one_sided');--> statement-breakpoint
ALTER TYPE "public"."candidate_pair_status" ADD VALUE 'proposable' BEFORE 'recommended';--> statement-breakpoint
ALTER TABLE "introduction_proposals" ADD COLUMN "origin_tier" "introduction_origin_tier" DEFAULT 'mutual' NOT NULL;--> statement-breakpoint
ALTER TABLE "introduction_proposals" ADD COLUMN "initiated_by_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "introduction_proposals" ADD CONSTRAINT "introduction_proposals_initiated_by_participant_id_participants_id_fk" FOREIGN KEY ("initiated_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;