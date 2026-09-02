ALTER TABLE "observations" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "observations_agent_run_idx" ON "observations" USING btree ("agent_run_id");