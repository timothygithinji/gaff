ALTER TABLE "listing_photos" ADD COLUMN "content_key" text;--> statement-breakpoint
ALTER TABLE "listing_photos" ADD COLUMN "phash" text;--> statement-breakpoint
CREATE INDEX "listing_photos_content_key_idx" ON "listing_photos" USING btree ("content_key");