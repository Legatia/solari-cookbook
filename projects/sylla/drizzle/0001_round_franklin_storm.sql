ALTER TABLE "agent_workspaces" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "approved_sources" ADD COLUMN "extracted_title" text;--> statement-breakpoint
ALTER TABLE "approved_sources" ADD COLUMN "evidence_excerpt" text;--> statement-breakpoint
ALTER TABLE "approved_sources" ADD COLUMN "research_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "agent_name" text;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "research_provider" text;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "research_run_reference" text;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "research_completed_at" timestamp with time zone;