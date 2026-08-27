ALTER TYPE "public"."shared_goal_scoring_type"
ADD VALUE IF NOT EXISTS 'one_time';
--> statement-breakpoint
ALTER TABLE "shared_goal_participants"
ADD COLUMN IF NOT EXISTS "personal_plan_goal_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shared_goal_participants"
 ADD CONSTRAINT "shared_goal_participants_personal_plan_goal_id_goals_id_fk"
 FOREIGN KEY ("personal_plan_goal_id") REFERENCES "public"."goals"("id")
 ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_goal_participants_personal_plan_goal_id_idx"
 ON "shared_goal_participants" ("personal_plan_goal_id");
