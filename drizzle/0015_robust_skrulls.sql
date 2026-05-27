CREATE TABLE "match_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"cluster_id" text NOT NULL,
	"notified_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_notifications" ADD CONSTRAINT "match_notifications_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match_notifications" ADD CONSTRAINT "match_notifications_cluster_id_property_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."property_clusters"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "match_notifications_household_cluster_uniq" ON "match_notifications" USING btree ("household_id","cluster_id");