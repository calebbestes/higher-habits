DO $$
BEGIN
  CREATE TYPE "public"."shared_goal_mode" AS ENUM('collaborative', 'competitive');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "public"."shared_goal_scoring_type" AS ENUM(
    'everyone_completes',
    'combined_target',
    'shared_streak',
    'first_to_target',
    'highest_total',
    'best_consistency',
    'longest_streak'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "public"."shared_goal_status" AS ENUM('active', 'completed', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "public"."shared_goal_participant_status" AS ENUM(
    'invited',
    'accepted',
    'declined',
    'left'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shared_goals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "mode" "shared_goal_mode" NOT NULL,
  "scoring_type" "shared_goal_scoring_type" NOT NULL,
  "target" integer,
  "starts_on" date,
  "ends_on" date,
  "status" "shared_goal_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_goals_owner_id_idx"
  ON "shared_goals" USING btree ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_goals_status_idx"
  ON "shared_goals" USING btree ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shared_goal_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shared_goal_id" uuid NOT NULL REFERENCES "shared_goals"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "personal_goal_id" uuid REFERENCES "goals"("id") ON DELETE SET NULL,
  "status" "shared_goal_participant_status" DEFAULT 'invited' NOT NULL,
  "joined_at" timestamp with time zone,
  "left_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shared_goal_participants_shared_goal_id_user_id_uidx"
  ON "shared_goal_participants" USING btree ("shared_goal_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_goal_participants_shared_goal_id_idx"
  ON "shared_goal_participants" USING btree ("shared_goal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_goal_participants_user_id_idx"
  ON "shared_goal_participants" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_goal_participants_personal_goal_id_idx"
  ON "shared_goal_participants" USING btree ("personal_goal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_goal_participants_status_idx"
  ON "shared_goal_participants" USING btree ("status");
