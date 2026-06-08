CREATE TABLE IF NOT EXISTS "feed_props" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_log_id" uuid NOT NULL REFERENCES "goal_logs"("id") ON DELETE CASCADE,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feed_props_goal_log_id_user_id_uidx" ON "feed_props" USING btree ("goal_log_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feed_props_goal_log_id_idx" ON "feed_props" USING btree ("goal_log_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feed_props_user_id_idx" ON "feed_props" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feed_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_log_id" uuid NOT NULL REFERENCES "goal_logs"("id") ON DELETE CASCADE,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feed_comments_goal_log_id_idx" ON "feed_comments" USING btree ("goal_log_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feed_comments_user_id_idx" ON "feed_comments" USING btree ("user_id");
