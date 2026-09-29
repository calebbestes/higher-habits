CREATE TABLE IF NOT EXISTS "social_feed_polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"social_feed_post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"question" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_feed_polls_post_uidx" UNIQUE("social_feed_post_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_polls" ADD CONSTRAINT "social_feed_polls_social_feed_post_id_social_feed_posts_id_fk" FOREIGN KEY ("social_feed_post_id") REFERENCES "public"."social_feed_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_polls" ADD CONSTRAINT "social_feed_polls_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_polls_post_id_idx" ON "social_feed_polls" ("social_feed_post_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_feed_poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"competitor_user_id" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "social_feed_poll_options_poll_competitor_uidx" UNIQUE("poll_id","competitor_user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_poll_options" ADD CONSTRAINT "social_feed_poll_options_poll_id_social_feed_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."social_feed_polls"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_poll_options" ADD CONSTRAINT "social_feed_poll_options_competitor_user_id_user_id_fk" FOREIGN KEY ("competitor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_poll_options_poll_id_idx" ON "social_feed_poll_options" ("poll_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_feed_poll_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_feed_poll_votes_poll_user_uidx" UNIQUE("poll_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_poll_votes" ADD CONSTRAINT "social_feed_poll_votes_poll_id_social_feed_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."social_feed_polls"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_poll_votes" ADD CONSTRAINT "social_feed_poll_votes_option_id_social_feed_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."social_feed_poll_options"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_poll_votes" ADD CONSTRAINT "social_feed_poll_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_poll_votes_poll_id_idx" ON "social_feed_poll_votes" ("poll_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_poll_votes_option_id_idx" ON "social_feed_poll_votes" ("option_id");
