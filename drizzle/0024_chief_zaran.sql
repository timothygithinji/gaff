CREATE TABLE "cluster_merge_dismissals" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"cluster_id_lo" text NOT NULL,
	"cluster_id_hi" text NOT NULL,
	"dismissed_by_user_id" text,
	"dismissed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cluster_merge_dismissals" ADD CONSTRAINT "cluster_merge_dismissals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cluster_merge_dismissals" ADD CONSTRAINT "cluster_merge_dismissals_cluster_id_lo_property_clusters_id_fk" FOREIGN KEY ("cluster_id_lo") REFERENCES "public"."property_clusters"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cluster_merge_dismissals" ADD CONSTRAINT "cluster_merge_dismissals_cluster_id_hi_property_clusters_id_fk" FOREIGN KEY ("cluster_id_hi") REFERENCES "public"."property_clusters"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cluster_merge_dismissals" ADD CONSTRAINT "cluster_merge_dismissals_dismissed_by_user_id_user_id_fk" FOREIGN KEY ("dismissed_by_user_id") REFERENCES "better_auth"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "cluster_merge_dismissals_pair_uniq" ON "cluster_merge_dismissals" USING btree ("household_id","cluster_id_lo","cluster_id_hi");--> statement-breakpoint
CREATE INDEX "cluster_merge_dismissals_household_idx" ON "cluster_merge_dismissals" USING btree ("household_id");