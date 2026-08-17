ALTER TABLE "bundles" RENAME TO "apps";--> statement-breakpoint
ALTER TABLE "publisher" RENAME TO "publishers";--> statement-breakpoint
ALTER TABLE "apps" DROP CONSTRAINT "bundles_publisher_id_publisher_id_fk";
--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE set null ON UPDATE no action;