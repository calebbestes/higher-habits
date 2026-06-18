CREATE TABLE IF NOT EXISTS "goal_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"target_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goal_checkpoints" ADD CONSTRAINT "goal_checkpoints_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goal_checkpoints" ADD CONSTRAINT "goal_checkpoints_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_checkpoints_goal_id_idx" ON "goal_checkpoints" ("goal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_checkpoints_user_id_idx" ON "goal_checkpoints" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_checkpoints_target_date_idx" ON "goal_checkpoints" ("target_date");
