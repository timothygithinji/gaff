ALTER TABLE "listings" ADD COLUMN "size_sq_ft" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "council_tax_band" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "pets_accepted" boolean;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD COLUMN "raw_key" text;