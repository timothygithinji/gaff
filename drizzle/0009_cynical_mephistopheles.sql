-- Replace `outcodes text[]` with a single `outcode text NOT NULL`. Any
-- existing row with multiple outcodes loses everything after the first;
-- we accepted that trade-off when narrowing the form to one postcode.
ALTER TABLE "searches" ADD COLUMN "outcode" text;--> statement-breakpoint
UPDATE "searches" SET "outcode" = "outcodes"[1] WHERE "outcode" IS NULL;--> statement-breakpoint
ALTER TABLE "searches" ALTER COLUMN "outcode" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "searches" DROP COLUMN IF EXISTS "outcodes";