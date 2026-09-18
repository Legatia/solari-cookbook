ALTER TABLE "event_invitations" ADD COLUMN "code_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "event_invitations_code_unique" ON "event_invitations" USING btree ("code_hash");