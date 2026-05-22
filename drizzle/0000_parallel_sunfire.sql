CREATE SCHEMA "better_auth";
--> statement-breakpoint
CREATE TYPE "public"."household_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('running', 'success', 'failure');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('active', 'let_agreed', 'removed');--> statement-breakpoint
CREATE TYPE "public"."swipe_outcome" AS ENUM('keep', 'skip', 'shortlist');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "better_auth"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" "job_status" NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrichments" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"features" jsonb NOT NULL,
	"epc" jsonb,
	"commute_minutes" jsonb,
	"ai_run_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "household_members" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "household_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "households" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "listing_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"url" text NOT NULL,
	"r2_key" text,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "listings" (
	"id" text PRIMARY KEY NOT NULL,
	"portal" text NOT NULL,
	"portal_listing_id" text NOT NULL,
	"cluster_id" text,
	"search_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"address_raw" text NOT NULL,
	"postcode" text,
	"bedrooms" integer,
	"bathrooms" integer,
	"price_monthly" integer,
	"property_type" text,
	"lat" numeric(9, 6),
	"lng" numeric(10, 6),
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"available_from" timestamp,
	"status" "listing_status" DEFAULT 'active' NOT NULL,
	"raw_json" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_clusters" (
	"id" text PRIMARY KEY NOT NULL,
	"normalised_address" text NOT NULL,
	"postcode" text,
	"lat" numeric(9, 6),
	"lng" numeric(10, 6),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scrape_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"search_id" text NOT NULL,
	"portal" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" "job_status" NOT NULL,
	"listings_found" integer DEFAULT 0 NOT NULL,
	"new_listings" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"cost_usd" numeric
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "searches" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"portals" text[] NOT NULL,
	"outcodes" text[] NOT NULL,
	"min_bedrooms" integer,
	"max_bedrooms" integer,
	"min_price" integer,
	"max_price" integer,
	"property_types" text[] NOT NULL,
	"commute_targets" jsonb NOT NULL,
	"ai_rules" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "better_auth"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "swipes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"cluster_id" text NOT NULL,
	"search_id" text NOT NULL,
	"outcome" "swipe_outcome" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "better_auth"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "better_auth"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "better_auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "better_auth"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrichments" ADD CONSTRAINT "enrichments_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrichments" ADD CONSTRAINT "enrichments_ai_run_id_ai_runs_id_fk" FOREIGN KEY ("ai_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "better_auth"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listings" ADD CONSTRAINT "listings_cluster_id_property_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."property_clusters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listings" ADD CONSTRAINT "listings_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "searches" ADD CONSTRAINT "searches_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "better_auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "better_auth"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "swipes" ADD CONSTRAINT "swipes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "better_auth"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "swipes" ADD CONSTRAINT "swipes_cluster_id_property_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."property_clusters"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "swipes" ADD CONSTRAINT "swipes_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "better_auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "enrichments_listing_prompt_version_uniq" ON "enrichments" USING btree ("listing_id","prompt_version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "household_members_household_user_uniq" ON "household_members" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "household_members_user_id_idx" ON "household_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listing_photos_listing_id_idx" ON "listing_photos" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "listings_search_portal_listing_id_uniq" ON "listings" USING btree ("search_id","portal","portal_listing_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_portal_listing_id_idx" ON "listings" USING btree ("portal","portal_listing_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_cluster_id_idx" ON "listings" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_search_id_idx" ON "listings" USING btree ("search_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_status_idx" ON "listings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "property_clusters_normalised_address_uniq" ON "property_clusters" USING btree ("normalised_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "searches_household_id_idx" ON "searches" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "better_auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "swipes_user_cluster_search_uniq" ON "swipes" USING btree ("user_id","cluster_id","search_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swipes_cluster_search_idx" ON "swipes" USING btree ("cluster_id","search_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swipes_user_id_idx" ON "swipes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "better_auth"."verification" USING btree ("identifier");--> statement-breakpoint
CREATE VIEW "public"."v_mutual_matches" AS (
  SELECT
    sa.cluster_id AS cluster_id,
    sa.search_id AS search_id,
    s.household_id AS household_id,
    sa.outcome AS user_a_outcome,
    sb.outcome AS user_b_outcome,
    GREATEST(sa.created_at, sb.created_at) AS matched_at
  FROM swipes sa
  JOIN swipes sb
    ON sa.cluster_id = sb.cluster_id
   AND sa.search_id = sb.search_id
   AND sa.user_id < sb.user_id
  JOIN searches s
    ON s.id = sa.search_id
  JOIN household_members hma
    ON hma.household_id = s.household_id AND hma.user_id = sa.user_id
  JOIN household_members hmb
    ON hmb.household_id = s.household_id AND hmb.user_id = sb.user_id
  WHERE sa.outcome IN ('keep', 'shortlist')
    AND sb.outcome IN ('keep', 'shortlist')
);