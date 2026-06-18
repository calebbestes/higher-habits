ALTER TABLE IF EXISTS "goals" RENAME TO "habits";
--> statement-breakpoint
ALTER INDEX IF EXISTS "goals_user_id_idx" RENAME TO "habits_user_id_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "goals_category_id_idx" RENAME TO "habits_category_id_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "goals_priority_idx" RENAME TO "habits_priority_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "goals_user_category_name_uidx" RENAME TO "habits_user_category_name_uidx";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "habits" RENAME CONSTRAINT "goals_user_id_user_id_fk" TO "habits_user_id_user_id_fk";
EXCEPTION
 WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goal_logs" RENAME CONSTRAINT "goal_logs_goal_id_fkey" TO "goal_logs_habit_id_fkey";
EXCEPTION
 WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "friend_messages" RENAME CONSTRAINT "friend_messages_goal_id_fkey" TO "friend_messages_habit_id_fkey";
EXCEPTION
 WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shared_goal_participants" RENAME CONSTRAINT "shared_goal_participants_personal_goal_id_fkey" TO "shared_goal_participants_personal_habit_id_fkey";
EXCEPTION
 WHEN undefined_object THEN null;
END $$;
