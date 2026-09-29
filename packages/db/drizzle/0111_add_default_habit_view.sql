ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "default_habit_view" text NOT NULL DEFAULT 'priority';
