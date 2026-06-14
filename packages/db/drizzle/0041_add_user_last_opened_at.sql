ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "last_opened_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "user_last_opened_at_idx" ON "user" USING btree ("last_opened_at");
