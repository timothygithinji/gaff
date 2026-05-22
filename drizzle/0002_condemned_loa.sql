CREATE TABLE IF NOT EXISTS "user_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_seen_matches" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_state" ADD CONSTRAINT "user_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "better_auth"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
