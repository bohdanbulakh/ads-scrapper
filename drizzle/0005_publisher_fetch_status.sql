CREATE TYPE "public"."publisher_fetch_status" AS ENUM('NOT_FOUND', 'NO_DOMAIN', 'RESOLVED');--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "publisher_fetch_status" "publisher_fetch_status";--> statement-breakpoint
ALTER TABLE "publishers" ADD CONSTRAINT "publishers_domain_unique" UNIQUE("domain");