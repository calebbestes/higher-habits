DO $$ BEGIN
 CREATE TYPE "public"."friend_goal_target_type" AS ENUM('habit', 'goal');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "friend_messages"
 ADD COLUMN IF NOT EXISTS "target_type" "public"."friend_goal_target_type" DEFAULT 'habit' NOT NULL;
--> statement-breakpoint
ALTER TABLE "friend_messages"
 ADD COLUMN IF NOT EXISTS "plan_goal_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "friend_messages"
 ADD CONSTRAINT "friend_messages_plan_goal_id_goals_id_fk"
 FOREIGN KEY ("plan_goal_id") REFERENCES "public"."goals"("id")
 ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friend_messages_plan_goal_id_idx"
 ON "friend_messages" ("plan_goal_id");
