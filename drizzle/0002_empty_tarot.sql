ALTER TABLE "apps" ADD COLUMN "next_to_fetch_publisher" timestamp;--> statement-breakpoint
ALTER TABLE "publishers" ADD COLUMN "next_to_fetch_file" timestamp;