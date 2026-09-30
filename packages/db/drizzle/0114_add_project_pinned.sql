ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "pinned" boolean NOT NULL DEFAULT false;
