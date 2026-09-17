ALTER TABLE "user_settings"
  ALTER COLUMN "notify_friend_milestone" SET DEFAULT true,
  ALTER COLUMN "notify_last_to_complete" SET DEFAULT true,
  ALTER COLUMN "notify_shared_goal_ending" SET DEFAULT true,
  ALTER COLUMN "notify_stakes_reminder" SET DEFAULT true,
  ALTER COLUMN "notify_weekly_recap" SET DEFAULT false;
