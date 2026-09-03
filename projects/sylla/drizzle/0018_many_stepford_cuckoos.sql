CREATE TYPE "public"."source_kind" AS ENUM('url', 'import');--> statement-breakpoint
ALTER TABLE "approved_sources" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approved_sources" ADD COLUMN "kind" "source_kind" DEFAULT 'url' NOT NULL;--> statement-breakpoint
ALTER TABLE "approved_sources" ADD COLUMN "platform" text;--> statement-breakpoint
ALTER TABLE "approved_sources" ADD COLUMN "import_filename" text;--> statement-breakpoint
ALTER TABLE "approved_sources" ADD COLUMN "import_digest" text;--> statement-breakpoint
CREATE UNIQUE INDEX "approved_sources_import_digest_unique" ON "approved_sources" USING btree ("participant_id","import_digest");