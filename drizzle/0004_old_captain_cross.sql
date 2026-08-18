CREATE TYPE "public"."ads_file_fetch_status" AS ENUM('NOT_FOUND', 'REJECTED', 'STORED');--> statement-breakpoint
ALTER TABLE "publishers" ADD COLUMN "ads_file_fetch_status" "ads_file_fetch_status";