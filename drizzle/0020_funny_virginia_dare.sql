CREATE TABLE "broadband_coverage" (
	"key" text PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"sfbb_pct" numeric(5, 2),
	"ufbb100_pct" numeric(5, 2),
	"ufbb300_pct" numeric(5, 2),
	"gigabit_pct" numeric(5, 2),
	"nga_pct" numeric(5, 2),
	"sample_size" integer DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
