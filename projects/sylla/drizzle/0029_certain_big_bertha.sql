CREATE TABLE "email_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"address" text NOT NULL,
	"verified_at" timestamp with time zone,
	"verification_token_hash" text,
	"verification_expires_at" timestamp with time zone,
	"unsubscribe_token_hash" text NOT NULL,
	"notify_work_finished" boolean DEFAULT true NOT NULL,
	"notify_needs_you" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_contacts" ADD CONSTRAINT "email_contacts_user_id_sylla_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sylla_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_contacts_user_unique" ON "email_contacts" USING btree ("user_id");