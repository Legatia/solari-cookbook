CREATE TABLE "agent_browser_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"provider" text DEFAULT 'solari' NOT NULL,
	"provider_profile_id" text NOT NULL,
	"current_url" text,
	"allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"action_count" integer DEFAULT 0 NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_browser_profiles" ADD CONSTRAINT "agent_browser_profiles_agent_id_personal_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."personal_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_browser_profiles" ADD CONSTRAINT "agent_browser_profiles_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_browser_profiles_agent_unique" ON "agent_browser_profiles" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_browser_profiles_provider_profile_unique" ON "agent_browser_profiles" USING btree ("provider_profile_id");--> statement-breakpoint
CREATE INDEX "agent_browser_profiles_participant_idx" ON "agent_browser_profiles" USING btree ("participant_id");