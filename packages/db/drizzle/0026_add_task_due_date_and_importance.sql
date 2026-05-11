DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'tasks'
			AND column_name = 'priority'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'tasks'
			AND column_name = 'importance'
	) THEN
		ALTER TABLE "tasks" RENAME COLUMN "priority" TO "importance";
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "due_date" date;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_due_date_idx" ON "tasks" USING btree ("due_date");
