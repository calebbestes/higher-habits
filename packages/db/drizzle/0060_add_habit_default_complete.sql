ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "default_complete" boolean DEFAULT false NOT NULL;
