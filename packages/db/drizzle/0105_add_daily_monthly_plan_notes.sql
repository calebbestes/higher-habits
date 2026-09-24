DO $$ BEGIN
  CREATE TYPE "public"."plan_note_period" AS ENUM('daily', 'monthly');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "plan_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "period" "plan_note_period" NOT NULL,
  "date" date NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "plan_notes_user_period_date_uidx" UNIQUE("user_id", "period", "date")
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "plan_notes"
    ADD CONSTRAINT "plan_notes_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plan_notes_user_id_idx"
  ON "plan_notes" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_notes_user_period_date_idx"
  ON "plan_notes" USING btree ("user_id", "period", "date");
