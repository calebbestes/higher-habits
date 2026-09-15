ALTER TABLE "user_settings"
  ALTER COLUMN "notify_monthly_goal_today" SET DEFAULT true,
  ALTER COLUMN "notify_tasks_due_today" SET DEFAULT true,
  ALTER COLUMN "notify_post_props" SET DEFAULT true,
  ALTER COLUMN "notify_friend_posts" SET DEFAULT true,
  ALTER COLUMN "notify_incentive_earned" SET DEFAULT true,
  ALTER COLUMN "notify_plan_tomorrow" SET DEFAULT true,
  ALTER COLUMN "notify_weekly_recap" SET DEFAULT true;

UPDATE "user_settings"
SET
  "notify_monthly_goal_today" = true,
  "notify_tasks_due_today" = true,
  "notify_post_props" = true,
  "notify_friend_posts" = true,
  "notify_incentive_earned" = true,
  "notify_plan_tomorrow" = true,
  "notify_weekly_recap" = true;
