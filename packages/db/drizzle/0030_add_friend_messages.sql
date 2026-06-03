DO $$
BEGIN
	CREATE TYPE "public"."friend_message_type" AS ENUM('message', 'incentive');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	CREATE TYPE "public"."friend_goal_scope" AS ENUM('all', 'shared', 'single', 'high');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "friend_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"friendship_id" uuid NOT NULL REFERENCES "friends"("id") ON DELETE CASCADE,
	"sender_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"recipient_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"type" "friend_message_type" NOT NULL,
	"body" text NOT NULL,
	"streak_days" integer,
	"streak_percent" integer,
	"goal_scope" "friend_goal_scope",
	"goal_id" uuid REFERENCES "goals"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friend_messages_friendship_id_idx" ON "friend_messages" USING btree ("friendship_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friend_messages_sender_id_idx" ON "friend_messages" USING btree ("sender_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friend_messages_recipient_id_idx" ON "friend_messages" USING btree ("recipient_id");
