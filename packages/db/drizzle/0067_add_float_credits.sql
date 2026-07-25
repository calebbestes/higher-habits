CREATE TABLE IF NOT EXISTS "float_credit_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "action_type" text NOT NULL,
  "action_date" date NOT NULL,
  "amount" integer NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "daily_award_key" text,
  "description" text DEFAULT '' NOT NULL,
  "metadata" json,
  "reverses_transaction_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "float_credit_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "action_type" text NOT NULL,
  "period_key" text NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "float_credit_transactions"
    ADD CONSTRAINT "float_credit_transactions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "float_credit_transactions"
    ADD CONSTRAINT "float_credit_transactions_reverses_transaction_id_fk"
    FOREIGN KEY ("reverses_transaction_id")
    REFERENCES "public"."float_credit_transactions"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "float_credit_progress"
    ADD CONSTRAINT "float_credit_progress_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "float_credit_transactions_user_award_key_uidx"
  ON "float_credit_transactions" ("user_id", "daily_award_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "float_credit_transactions_reversal_uidx"
  ON "float_credit_transactions" ("reverses_transaction_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "float_credit_transactions_user_id_idx"
  ON "float_credit_transactions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "float_credit_transactions_action_date_idx"
  ON "float_credit_transactions" ("action_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "float_credit_transactions_action_type_idx"
  ON "float_credit_transactions" ("action_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "float_credit_transactions_source_idx"
  ON "float_credit_transactions" ("source_type", "source_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "float_credit_progress_user_action_period_uidx"
  ON "float_credit_progress" ("user_id", "action_type", "period_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "float_credit_progress_user_id_idx"
  ON "float_credit_progress" ("user_id");
