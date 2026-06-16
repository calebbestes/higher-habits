DO $$
BEGIN
  CREATE TYPE "public"."goal_visibility" AS ENUM(
    'only_me',
    'goal_friends',
    'all_friends'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "goals"
  ADD COLUMN IF NOT EXISTS "visibility" "goal_visibility" DEFAULT 'only_me' NOT NULL;
