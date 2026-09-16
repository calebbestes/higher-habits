ALTER TABLE "social_feed_posts"
ADD COLUMN IF NOT EXISTS "linked_type" text;
--> statement-breakpoint
ALTER TABLE "social_feed_posts"
ADD COLUMN IF NOT EXISTS "linked_id" uuid;
--> statement-breakpoint
ALTER TABLE "social_feed_posts"
ADD COLUMN IF NOT EXISTS "visibility" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_feed_post_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"social_feed_post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"storage_path" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_feed_post_photos_storage_path_uidx" UNIQUE("storage_path")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_post_photos" ADD CONSTRAINT "social_feed_post_photos_social_feed_post_id_social_feed_posts_id_fk" FOREIGN KEY ("social_feed_post_id") REFERENCES "public"."social_feed_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_post_photos" ADD CONSTRAINT "social_feed_post_photos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_post_photos_post_id_idx" ON "social_feed_post_photos" ("social_feed_post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_post_photos_user_id_idx" ON "social_feed_post_photos" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_feed_post_audience_friends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"social_feed_post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"friend_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_feed_post_audience_friends_post_friend_uidx" UNIQUE("social_feed_post_id","friend_user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_post_audience_friends" ADD CONSTRAINT "social_feed_post_audience_friends_social_feed_post_id_social_feed_posts_id_fk" FOREIGN KEY ("social_feed_post_id") REFERENCES "public"."social_feed_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_post_audience_friends" ADD CONSTRAINT "social_feed_post_audience_friends_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_post_audience_friends" ADD CONSTRAINT "social_feed_post_audience_friends_friend_user_id_user_id_fk" FOREIGN KEY ("friend_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_post_audience_friends_post_id_idx" ON "social_feed_post_audience_friends" ("social_feed_post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_post_audience_friends_user_id_idx" ON "social_feed_post_audience_friends" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_post_audience_friends_friend_user_id_idx" ON "social_feed_post_audience_friends" ("friend_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_feed_post_audience_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"social_feed_post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_feed_post_audience_groups_post_group_uidx" UNIQUE("social_feed_post_id","group_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_post_audience_groups" ADD CONSTRAINT "social_feed_post_audience_groups_social_feed_post_id_social_feed_posts_id_fk" FOREIGN KEY ("social_feed_post_id") REFERENCES "public"."social_feed_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_post_audience_groups" ADD CONSTRAINT "social_feed_post_audience_groups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_post_audience_groups" ADD CONSTRAINT "social_feed_post_audience_groups_group_id_friend_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."friend_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_post_audience_groups_post_id_idx" ON "social_feed_post_audience_groups" ("social_feed_post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_post_audience_groups_user_id_idx" ON "social_feed_post_audience_groups" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_post_audience_groups_group_id_idx" ON "social_feed_post_audience_groups" ("group_id");
