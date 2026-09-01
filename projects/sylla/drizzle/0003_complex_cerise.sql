CREATE TABLE "host_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"auth_identity_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "host_connections" ADD CONSTRAINT "host_connections_user_id_sylla_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sylla_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_connections" ADD CONSTRAINT "host_connections_auth_identity_id_auth_identities_id_fk" FOREIGN KEY ("auth_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "host_connections_user_idx" ON "host_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "host_connections_identity_client_unique" ON "host_connections" USING btree ("auth_identity_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_event_agent_unique" ON "participants" USING btree ("event_id","agent_id");