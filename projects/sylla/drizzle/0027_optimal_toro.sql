CREATE TYPE "public"."subject_kind" AS ENUM('person', 'organization');--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"kind" "subject_kind" NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"relationship" text,
	"next_action" text,
	"next_action_at" timestamp with time zone,
	"last_contact_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "subject_id" uuid;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subjects_participant_idx" ON "subjects" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_participant_name_unique" ON "subjects" USING btree ("participant_id","normalized_name");--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "observations_subject_idx" ON "observations" USING btree ("subject_id");