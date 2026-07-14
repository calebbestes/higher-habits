ALTER TABLE "goal_logs" ADD COLUMN IF NOT EXISTS "completed_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "planned_events" ADD COLUMN IF NOT EXISTS "source_parent_id" uuid;
CREATE INDEX IF NOT EXISTS "planned_events_source_parent_idx" ON "planned_events" ("source_type","source_parent_id");
