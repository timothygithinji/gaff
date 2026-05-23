ALTER TABLE "searches" ADD COLUMN "exclude_outcodes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "transport_targets" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "searches"
SET "exclude_outcodes" = COALESCE(
  ARRAY(SELECT jsonb_array_elements_text("ai_rules"->'excludeOutcodes')),
  '{}'
);--> statement-breakpoint
ALTER TABLE "searches" DROP COLUMN IF EXISTS "ai_rules";