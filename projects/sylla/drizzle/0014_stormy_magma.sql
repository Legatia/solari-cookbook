CREATE TABLE "agent_conversation_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"response_length" text DEFAULT 'short' NOT NULL,
	"warmth" integer DEFAULT 3 NOT NULL,
	"directness" integer DEFAULT 4 NOT NULL,
	"humor" text DEFAULT 'light' NOT NULL,
	"challenge_style" text DEFAULT 'gentle' NOT NULL,
	"preferred_address" text,
	"preferred_behaviors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avoided_behaviors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_conversation_profiles" ADD CONSTRAINT "agent_conversation_profiles_agent_id_personal_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."personal_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_conversation_profiles_agent_unique" ON "agent_conversation_profiles" USING btree ("agent_id");