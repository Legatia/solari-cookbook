CREATE TYPE "public"."subject_stage" AS ENUM('new', 'talking', 'diligence', 'committed', 'passed');--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "stage" "subject_stage" DEFAULT 'new' NOT NULL;--> statement-breakpoint
CREATE INDEX "subjects_stage_idx" ON "subjects" USING btree ("participant_id","stage");