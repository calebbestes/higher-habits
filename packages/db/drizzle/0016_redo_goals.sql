DROP TABLE IF EXISTS "goals";
--> statement-breakpoint
CREATE TYPE "public"."goal_period" AS ENUM('daily', 'weekly', 'monthly');
--> statement-breakpoint
CREATE TYPE "public"."goal_priority" AS ENUM('high', 'medium', 'low');
--> statement-breakpoint
CREATE TYPE "public"."log_status" AS ENUM('complete', 'incomplete');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "categories" ("name", "icon") VALUES
	('Spiritual', 'fa7-solid:hands-praying'),
	('Physical', 'fa7-solid:dumbbell'),
	('Work', 'fa7-solid:briefcase'),
	('Custom', 'fa7-solid:star');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"frequency_goal" integer,
	"period" "goal_period",
	"category_id" uuid NOT NULL,
	"priority" "goal_priority" NOT NULL,
	"icon_key" text DEFAULT '' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_category_id_idx" ON "goals" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_priority_idx" ON "goals" USING btree ("priority");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goal_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "log_status" NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_logs_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE,
	CONSTRAINT "goal_logs_goal_id_date_uidx" UNIQUE ("goal_id", "date")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_logs_date_idx" ON "goal_logs" USING btree ("date");
