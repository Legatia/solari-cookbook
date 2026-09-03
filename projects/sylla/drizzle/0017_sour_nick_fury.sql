CREATE TYPE "public"."device_login_status" AS ENUM('pending', 'approved', 'consumed', 'denied');--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_login_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_code_hash" text NOT NULL,
	"user_code_hash" text NOT NULL,
	"user_id" uuid,
	"approved_by_participant_id" uuid,
	"approved_by_client_id" text,
	"device_label" text NOT NULL,
	"request_user_agent" text,
	"request_location" text,
	"request_ip_hash" text,
	"status" "device_login_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"denied_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"poll_count" integer DEFAULT 0 NOT NULL,
	"approval_attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_login_requests" ADD CONSTRAINT "device_login_requests_user_id_sylla_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sylla_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_login_requests" ADD CONSTRAINT "device_login_requests_approved_by_participant_id_participants_id_fk" FOREIGN KEY ("approved_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_login_requests_device_code_unique" ON "device_login_requests" USING btree ("device_code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "device_login_requests_user_code_unique" ON "device_login_requests" USING btree ("user_code_hash");--> statement-breakpoint
CREATE INDEX "device_login_requests_user_idx" ON "device_login_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_login_requests_expiry_idx" ON "device_login_requests" USING btree ("status","expires_at");