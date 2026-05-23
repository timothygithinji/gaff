ALTER TABLE "searches" ADD COLUMN "min_bathrooms" integer;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "max_bathrooms" integer;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "furnished" text;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "must_haves" text[] DEFAULT '{}'::text[] NOT NULL;