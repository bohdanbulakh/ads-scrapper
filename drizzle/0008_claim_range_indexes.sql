-- The claim queries used to spell eligibility as `next_to_fetch <= now() OR
-- next_to_fetch IS NULL`. The OR left the index scan without an upper bound,
-- so an idle queue re-scanned the whole table every minute. Dropping the NULL
-- case makes it a plain range scan; a row that was never scheduled is due at
-- the time it was discovered.
UPDATE "apps" SET "next_to_fetch_publisher" = "created_at" WHERE "next_to_fetch_publisher" IS NULL;--> statement-breakpoint
UPDATE "publishers" SET "next_to_fetch_file" = "created_at" WHERE "next_to_fetch_file" IS NULL;--> statement-breakpoint
DROP INDEX "apps_next_to_fetch_publisher_idx";--> statement-breakpoint
DROP INDEX "publishers_next_to_fetch_file_idx";--> statement-breakpoint
ALTER TABLE "apps" ALTER COLUMN "next_to_fetch_publisher" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "apps" ALTER COLUMN "next_to_fetch_publisher" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "publishers" ALTER COLUMN "next_to_fetch_file" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "publishers" ALTER COLUMN "next_to_fetch_file" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "apps_next_to_fetch_publisher_idx" ON "apps" USING btree ("next_to_fetch_publisher") WHERE not "apps"."locked";--> statement-breakpoint
CREATE INDEX "publishers_next_to_fetch_file_idx" ON "publishers" USING btree ("next_to_fetch_file") WHERE not "publishers"."locked";