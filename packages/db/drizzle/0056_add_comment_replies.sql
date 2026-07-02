ALTER TABLE "feed_comments" ADD COLUMN IF NOT EXISTS "parent_comment_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "feed_comments"
    ADD CONSTRAINT "feed_comments_parent_comment_id_feed_comments_id_fk"
    FOREIGN KEY ("parent_comment_id")
    REFERENCES "feed_comments"("id")
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feed_comments_parent_comment_id_idx" ON "feed_comments" USING btree ("parent_comment_id");
