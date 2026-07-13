ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "timing" text DEFAULT 'current' NOT NULL;
--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
WITH ranked_goals AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) - 1 AS next_sort_order
  FROM goals
)
UPDATE goals
SET sort_order = ranked_goals.next_sort_order
FROM ranked_goals
WHERE goals.id = ranked_goals.id;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_user_sort_order_idx" ON "goals" USING btree ("user_id", "sort_order");
