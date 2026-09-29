ALTER TABLE "goal_checkpoints"
  ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goal_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "goal_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "goal_links_goal_id_goals_id_fk"
    FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade,
  CONSTRAINT "goal_links_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade,
  CONSTRAINT "goal_links_source_uidx"
    UNIQUE ("goal_id", "source_type", "source_id")
);
--> statement-breakpoint
INSERT INTO "goal_links" ("goal_id", "user_id", "source_type", "source_id")
SELECT DISTINCT
  checkpoints."goal_id",
  links."user_id",
  links."source_type",
  links."source_id"
FROM "goal_checkpoint_links" links
JOIN "goal_checkpoints" checkpoints
  ON checkpoints."id" = links."checkpoint_id"
ON CONFLICT ("goal_id", "source_type", "source_id") DO NOTHING;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_links_goal_id_idx"
  ON "goal_links" ("goal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_links_user_id_idx"
  ON "goal_links" ("user_id");
