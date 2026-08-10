CREATE TABLE IF NOT EXISTS "social_feed_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"target_user_id" text,
	"kind" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_feed_posts_source_uidx" UNIQUE("source_type","source_id","kind")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_posts" ADD CONSTRAINT "social_feed_posts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_feed_posts" ADD CONSTRAINT "social_feed_posts_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_posts_user_id_idx" ON "social_feed_posts" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_posts_target_user_id_idx" ON "social_feed_posts" ("target_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_feed_posts_created_at_idx" ON "social_feed_posts" ("created_at");
