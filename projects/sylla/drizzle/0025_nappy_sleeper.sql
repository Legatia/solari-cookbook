CREATE TYPE "public"."boundary_kind" AS ENUM('paused', 'mutual_only', 'weekly_limit');--> statement-breakpoint
CREATE TABLE "participant_boundaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"kind" "boundary_kind" NOT NULL,
	"threshold" integer,
	"until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shield_declines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"candidate_pair_id" uuid NOT NULL,
	"kind" "boundary_kind" NOT NULL,
	"origin_tier" "introduction_origin_tier" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participant_boundaries" ADD CONSTRAINT "participant_boundaries_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shield_declines" ADD CONSTRAINT "shield_declines_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shield_declines" ADD CONSTRAINT "shield_declines_candidate_pair_id_candidate_pairs_id_fk" FOREIGN KEY ("candidate_pair_id") REFERENCES "public"."candidate_pairs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participant_boundaries_participant_idx" ON "participant_boundaries" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "shield_declines_participant_idx" ON "shield_declines" USING btree ("participant_id");