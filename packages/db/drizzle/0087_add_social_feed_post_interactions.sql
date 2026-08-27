CREATE TABLE IF NOT EXISTS "social_feed_post_props" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"social_feed_post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_feed_post_props_post_user_uidx" UNIQUE("social_feed_post_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_post_props" ADD CONSTRAINT "social_feed_post_props_social_feed_post_id_social_feed_posts_id_fk" FOREIGN KEY ("social_feed_post_id") REFERENCES "public"."social_feed_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_post_props" ADD CONSTRAINT "social_feed_post_props_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_post_props_post_id_idx" ON "social_feed_post_props" ("social_feed_post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_post_props_user_id_idx" ON "social_feed_post_props" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_feed_post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"social_feed_post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"parent_comment_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_post_comments" ADD CONSTRAINT "social_feed_post_comments_social_feed_post_id_social_feed_posts_id_fk" FOREIGN KEY ("social_feed_post_id") REFERENCES "public"."social_feed_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_post_comments" ADD CONSTRAINT "social_feed_post_comments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_post_comments" ADD CONSTRAINT "social_feed_post_comments_parent_comment_id_social_feed_post_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."social_feed_post_comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_post_comments_post_id_idx" ON "social_feed_post_comments" ("social_feed_post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_post_comments_parent_comment_id_idx" ON "social_feed_post_comments" ("parent_comment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_post_comments_user_id_idx" ON "social_feed_post_comments" ("user_id");
