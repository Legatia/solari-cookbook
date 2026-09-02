CREATE TABLE "agent_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"objective" text NOT NULL,
	"requested_outcome" text,
	"capability" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"risk_level" text DEFAULT 'observe' NOT NULL,
	"approval_required" boolean DEFAULT false NOT NULL,
	"constraints" jsonb NOT NULL,
	"resource_plan" jsonb NOT NULL,
	"plan" jsonb NOT NULL,
	"result" jsonb,
	"last_error" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mission_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"title" text NOT NULL,
	"resource" text NOT NULL,
	"risk_level" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"provider_reference" text,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_user_id_sylla_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sylla_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_agent_id_personal_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."personal_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_steps" ADD CONSTRAINT "mission_steps_mission_id_agent_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."agent_missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_missions_agent_idx" ON "agent_missions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_missions_participant_idx" ON "agent_missions" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "agent_missions_status_idx" ON "agent_missions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_missions_participant_idempotency_unique" ON "agent_missions" USING btree ("participant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "mission_steps_mission_idx" ON "mission_steps" USING btree ("mission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mission_steps_mission_sequence_unique" ON "mission_steps" USING btree ("mission_id","sequence");