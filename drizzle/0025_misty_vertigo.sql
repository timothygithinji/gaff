CREATE TABLE "cluster_deferrals" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"cluster_id" text NOT NULL,
	"deferred_by_user_id" text,
	"defer_until" timestamp NOT NULL,
	"rescraped_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cluster_deferrals" ADD CONSTRAINT "cluster_deferrals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cluster_deferrals" ADD CONSTRAINT "cluster_deferrals_cluster_id_property_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."property_clusters"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cluster_deferrals" ADD CONSTRAINT "cluster_deferrals_deferred_by_user_id_user_id_fk" FOREIGN KEY ("deferred_by_user_id") REFERENCES "better_auth"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "cluster_deferrals_household_cluster_uniq" ON "cluster_deferrals" USING btree ("household_id","cluster_id");--> statement-breakpoint
CREATE INDEX "cluster_deferrals_defer_until_idx" ON "cluster_deferrals" USING btree ("defer_until");