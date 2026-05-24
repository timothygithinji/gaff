-- Replace the single `outcode` column with the richer `location` jsonb,
-- and rename `exclude_outcodes` text[] to `exclude_locations` jsonb[].
-- Both new columns are NOT NULL; existing rows are backfilled to
-- degenerate-but-valid SearchLocation shapes so the migration runs on
-- live data. The degenerate rows have placeId="" and bounds=null and
-- portalRefs={} — they'll scrape (with portals that can resolve from
-- name alone) but the user should re-save them via the form to get
-- the proper Google place_id + bounds + cached portal refs.
ALTER TABLE "searches" ADD COLUMN "location" jsonb;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "exclude_locations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint

UPDATE "searches" SET "location" = jsonb_build_object(
    'placeId',          '',
    'name',             "outcode",
    'formattedAddress', "outcode" || ', UK',
    'type',             'postal_code',
    'lat',              0,
    'lng',              0,
    'bounds',           null,
    'portalRefs',       jsonb_build_object()
) WHERE "location" IS NULL;--> statement-breakpoint

UPDATE "searches" SET "exclude_locations" = COALESCE(
    (
        SELECT jsonb_agg(jsonb_build_object(
            'placeId',          '',
            'name',             oc,
            'formattedAddress', oc || ', UK',
            'type',             'postal_code',
            'lat',              0,
            'lng',              0,
            'bounds',           null,
            'portalRefs',       jsonb_build_object()
        ))
        FROM unnest("exclude_outcodes") AS oc
    ),
    '[]'::jsonb
) WHERE array_length("exclude_outcodes", 1) > 0;--> statement-breakpoint

ALTER TABLE "searches" ALTER COLUMN "location" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "searches" DROP COLUMN IF EXISTS "outcode";--> statement-breakpoint
ALTER TABLE "searches" DROP COLUMN IF EXISTS "exclude_outcodes";