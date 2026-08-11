ALTER TABLE "habits"
ADD COLUMN IF NOT EXISTS "require_evidence" boolean DEFAULT true NOT NULL;
