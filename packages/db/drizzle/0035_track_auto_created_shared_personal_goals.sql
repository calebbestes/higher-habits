ALTER TABLE "shared_goal_participants"
  ADD COLUMN IF NOT EXISTS "personal_goal_auto_created" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "shared_goal_participants" AS participant
SET "personal_goal_auto_created" = true
FROM "goals" AS goal
INNER JOIN "categories" AS category ON category."id" = goal."category_id"
WHERE participant."personal_goal_id" = goal."id"
  AND category."user_id" = participant."user_id"
  AND category."name" = 'Shared Goals';
