CREATE TABLE "openrent_seen_ids" (
	"search_id" text NOT NULL,
	"portal_listing_id" text NOT NULL,
	"matched" boolean NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "openrent_seen_ids_search_id_portal_listing_id_pk" PRIMARY KEY("search_id","portal_listing_id")
);
--> statement-breakpoint
ALTER TABLE "openrent_seen_ids" ADD CONSTRAINT "openrent_seen_ids_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "openrent_seen_ids_fetched_at_idx" ON "openrent_seen_ids" USING btree ("fetched_at");