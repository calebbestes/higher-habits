ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_deleted_at_idx"
  ON "user" USING btree ("deleted_at");
