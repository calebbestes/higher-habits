CREATE TABLE IF NOT EXISTS "goal_log_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_log_id" uuid NOT NULL REFERENCES "goal_logs"("id") ON DELETE CASCADE,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"storage_path" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_log_photos_goal_log_id_idx" ON "goal_log_photos" USING btree ("goal_log_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_log_photos_user_id_idx" ON "goal_log_photos" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "goal_log_photos_storage_path_uidx" ON "goal_log_photos" USING btree ("storage_path");
