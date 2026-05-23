ALTER TABLE "better_auth"."account" DROP CONSTRAINT "account_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_runs" DROP CONSTRAINT "ai_runs_listing_id_listings_id_fk";
--> statement-breakpoint
ALTER TABLE "enrichments" DROP CONSTRAINT "enrichments_listing_id_listings_id_fk";
--> statement-breakpoint
ALTER TABLE "enrichments" DROP CONSTRAINT "enrichments_ai_run_id_ai_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "household_members" DROP CONSTRAINT "household_members_household_id_households_id_fk";
--> statement-breakpoint
ALTER TABLE "household_members" DROP CONSTRAINT "household_members_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "listing_photos" DROP CONSTRAINT "listing_photos_listing_id_listings_id_fk";
--> statement-breakpoint
ALTER TABLE "listings" DROP CONSTRAINT "listings_cluster_id_property_clusters_id_fk";
--> statement-breakpoint
ALTER TABLE "listings" DROP CONSTRAINT "listings_search_id_searches_id_fk";
--> statement-breakpoint
ALTER TABLE "scrape_runs" DROP CONSTRAINT "scrape_runs_search_id_searches_id_fk";
--> statement-breakpoint
ALTER TABLE "searches" DROP CONSTRAINT "searches_household_id_households_id_fk";
--> statement-breakpoint
ALTER TABLE "better_auth"."session" DROP CONSTRAINT "session_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "swipes" DROP CONSTRAINT "swipes_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "swipes" DROP CONSTRAINT "swipes_cluster_id_property_clusters_id_fk";
--> statement-breakpoint
ALTER TABLE "swipes" DROP CONSTRAINT "swipes_search_id_searches_id_fk";
--> statement-breakpoint
ALTER TABLE "user_state" DROP CONSTRAINT "user_state_user_id_user_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "better_auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "better_auth"."user"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrichments" ADD CONSTRAINT "enrichments_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrichments" ADD CONSTRAINT "enrichments_ai_run_id_ai_runs_id_fk" FOREIGN KEY ("ai_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "better_auth"."user"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listings" ADD CONSTRAINT "listings_cluster_id_property_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."property_clusters"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listings" ADD CONSTRAINT "listings_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "searches" ADD CONSTRAINT "searches_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "better_auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "better_auth"."user"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "swipes" ADD CONSTRAINT "swipes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "better_auth"."user"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "swipes" ADD CONSTRAINT "swipes_cluster_id_property_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."property_clusters"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "swipes" ADD CONSTRAINT "swipes_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_state" ADD CONSTRAINT "user_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "better_auth"."user"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
