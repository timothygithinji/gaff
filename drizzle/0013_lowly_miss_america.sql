CREATE TABLE "council_tax_rates" (
	"authority_code" text NOT NULL,
	"authority_name" text NOT NULL,
	"tax_year" text NOT NULL,
	"band_d_pence" integer NOT NULL,
	"source" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "council_tax_rates_authority_code_tax_year_pk" PRIMARY KEY("authority_code","tax_year")
);
--> statement-breakpoint
ALTER TABLE "property_clusters" ADD COLUMN "council_tax_authority_code" text;--> statement-breakpoint
ALTER TABLE "property_clusters" ADD COLUMN "council_tax_authority_name" text;--> statement-breakpoint
CREATE INDEX "council_tax_rates_tax_year_idx" ON "council_tax_rates" USING btree ("tax_year");