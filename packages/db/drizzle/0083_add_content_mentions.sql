CREATE TYPE "mention_source_type" AS ENUM (
  'goal_log',
  'goal_checkpoint',
  'reflection_post',
  'feed_comment',
  'reflection_comment'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_mentions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_type" "mention_source_type" NOT NULL,
  "source_id" uuid NOT NULL,
  "author_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "mentioned_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "content_mentions_source_user_uidx"
    UNIQUE ("source_type", "source_id", "mentioned_user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_mentions_source_idx"
  ON "content_mentions" USING btree ("source_type", "source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_mentions_mentioned_user_id_idx"
  ON "content_mentions" USING btree ("mentioned_user_id");
