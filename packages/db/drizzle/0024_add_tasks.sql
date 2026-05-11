CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"name" text NOT NULL,
	"importance" text DEFAULT '' NOT NULL,
	"due_date" date,
	"completed_at" date,
	"time_required" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_user_id_idx" ON "tasks" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_due_date_idx" ON "tasks" USING btree ("due_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_completed_at_idx" ON "tasks" USING btree ("completed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_created_at_idx" ON "tasks" USING btree ("created_at");
