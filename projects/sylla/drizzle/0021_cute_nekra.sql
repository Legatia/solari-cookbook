ALTER TYPE "public"."model_provider" ADD VALUE 'openai_compatible';--> statement-breakpoint
ALTER TABLE "participant_model_keys" ADD COLUMN "base_url" text;