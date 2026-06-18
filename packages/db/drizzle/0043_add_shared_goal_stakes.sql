CREATE TYPE "public"."shared_goal_stake_type" AS ENUM('none', 'carrot', 'stick');--> statement-breakpoint
ALTER TABLE "shared_goals" ADD COLUMN "stake_type" "shared_goal_stake_type" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "shared_goals" ADD COLUMN "stake_description" text;
