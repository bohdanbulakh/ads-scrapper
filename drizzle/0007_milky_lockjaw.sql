ALTER TABLE "apps" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "publishers" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;