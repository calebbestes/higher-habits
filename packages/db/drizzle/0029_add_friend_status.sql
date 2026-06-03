DO $$
BEGIN
	CREATE TYPE "friend_status" AS ENUM ('requested', 'accepted', 'archived');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "status" "friend_status" DEFAULT 'requested' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friends_status_idx" ON "friends" USING btree ("status");
