ALTER TABLE "shared_goals"
ADD COLUMN IF NOT EXISTS "open_invite" boolean DEFAULT false NOT NULL;
