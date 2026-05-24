CREATE TYPE "public"."pipeline_archived_reason" AS ENUM('accepted', 'passed', 'let_to_someone_else', 'withdrawn', 'other');--> statement-breakpoint
CREATE TYPE "public"."pipeline_status" AS ENUM('shortlisted', 'contacted', 'viewing_booked', 'offer_made', 'archived');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shortlist_pipeline" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"cluster_id" text NOT NULL,
	"status" "pipeline_status" NOT NULL,
	"archived_reason" "pipeline_archived_reason",
	"notes" text,
	"last_moved_at" timestamp DEFAULT now() NOT NULL,
	"last_moved_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shortlist_pipeline" ADD CONSTRAINT "shortlist_pipeline_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shortlist_pipeline" ADD CONSTRAINT "shortlist_pipeline_cluster_id_property_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."property_clusters"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shortlist_pipeline" ADD CONSTRAINT "shortlist_pipeline_last_moved_by_user_id_user_id_fk" FOREIGN KEY ("last_moved_by_user_id") REFERENCES "better_auth"."user"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shortlist_pipeline_household_cluster_uniq" ON "shortlist_pipeline" USING btree ("household_id","cluster_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shortlist_pipeline_household_status_idx" ON "shortlist_pipeline" USING btree ("household_id","status");