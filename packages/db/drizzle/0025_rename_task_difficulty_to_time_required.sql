DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'tasks'
			AND column_name = 'difficulty_level'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'tasks'
			AND column_name = 'time_required'
	) THEN
		ALTER TABLE "tasks" RENAME COLUMN "difficulty_level" TO "time_required";
	END IF;
END $$;
