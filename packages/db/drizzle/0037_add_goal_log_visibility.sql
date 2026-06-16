ALTER TABLE "goal_logs"
  ADD COLUMN IF NOT EXISTS "visibility" "goal_visibility";
--> statement-breakpoint
UPDATE "goal_logs" AS log
SET "visibility" = goal."visibility"
FROM "goals" AS goal
WHERE log."goal_id" = goal."id"
  AND log."visibility" IS NULL;
--> statement-breakpoint
ALTER TABLE "goal_logs"
  ALTER COLUMN "visibility" SET DEFAULT 'only_me';
--> statement-breakpoint
ALTER TABLE "goal_logs"
  ALTER COLUMN "visibility" SET NOT NULL;
