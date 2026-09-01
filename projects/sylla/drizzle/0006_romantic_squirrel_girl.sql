ALTER TABLE "agent_runs" ADD COLUMN "fallback_worker_run_id" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "fallback_provider" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "fallback_model" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "fallback_error" text;