CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text,
	"focus" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sylla_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_workspaces" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_workspaces" ADD COLUMN "solari_volume_id" text;--> statement-breakpoint
ALTER TABLE "agent_workspaces" ADD COLUMN "solari_snapshot_id" text;--> statement-breakpoint
ALTER TABLE "agent_workspaces" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_sylla_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sylla_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_agents" ADD CONSTRAINT "personal_agents_owner_user_id_sylla_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."sylla_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_identities_user_idx" ON "auth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_provider_subject_unique" ON "auth_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_agents_owner_user_unique" ON "personal_agents" USING btree ("owner_user_id");--> statement-breakpoint
ALTER TABLE "agent_workspaces" ADD CONSTRAINT "agent_workspaces_agent_id_personal_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."personal_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_sylla_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sylla_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_agent_id_personal_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."personal_agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_workspaces_agent_unique" ON "agent_workspaces" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "participants_user_idx" ON "participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "participants_agent_idx" ON "participants" USING btree ("agent_id");