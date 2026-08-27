ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "notify_friend_nudges" boolean NOT NULL DEFAULT true;

ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "time_zone" text NOT NULL DEFAULT 'America/Denver';

ALTER TABLE "friend_messages"
  ADD COLUMN IF NOT EXISTS "incentive_completed_at" timestamptz;

CREATE TABLE IF NOT EXISTS "notification_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "dedupe_key" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_deliveries_user_key_uidx"
  ON "notification_deliveries" ("user_id", "dedupe_key");

CREATE INDEX IF NOT EXISTS "notification_deliveries_created_at_idx"
  ON "notification_deliveries" ("created_at");

-- Move untouched all-on settings to the quieter first-run defaults while
-- preserving any user who has already customized at least one preference.
UPDATE "user_settings"
SET
  "notify_monthly_goal_today" = false,
  "notify_tasks_due_today" = false,
  "notify_streak_at_risk" = false,
  "notify_streak_milestone" = false,
  "notify_end_of_day_nudge" = false,
  "notify_post_props" = false,
  "notify_friend_posts" = false,
  "notify_friend_milestone" = false,
  "notify_last_to_complete" = false,
  "notify_shared_goal_ending" = false,
  "notify_stakes_reminder" = false,
  "notify_incentive_earned" = false,
  "notify_plan_tomorrow" = false,
  "notify_weekly_recap" = false
WHERE
  "notify_friend_requests" = true
  AND "notify_monthly_goal_today" = true
  AND "notify_tasks_due_today" = true
  AND "notify_inactivity_reminder" = true
  AND "notify_shared_goal_invites" = true
  AND "notify_streak_at_risk" = true
  AND "notify_streak_milestone" = true
  AND "notify_end_of_day_nudge" = true
  AND "notify_post_props" = true
  AND "notify_post_comments" = true
  AND "notify_friend_posts" = true
  AND "notify_friend_nudges" = true
  AND "notify_friend_request_accepted" = true
  AND "notify_friend_milestone" = true
  AND "notify_shared_goal_responses" = true
  AND "notify_last_to_complete" = true
  AND "notify_shared_goal_ending" = true
  AND "notify_stakes_reminder" = true
  AND "notify_incentive_earned" = true
  AND "notify_plan_tomorrow" = true
  AND "notify_weekly_recap" = true
  AND "notify_schedule_events" = true;
