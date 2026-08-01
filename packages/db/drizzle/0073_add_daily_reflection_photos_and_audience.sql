CREATE TABLE IF NOT EXISTS "daily_reflection_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reflection_post_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "storage_path" text NOT NULL,
  "content_type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "daily_reflection_photos_reflection_post_id_daily_reflection_posts_id_fk"
    FOREIGN KEY ("reflection_post_id") REFERENCES "public"."daily_reflection_posts"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "daily_reflection_photos_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "daily_reflection_photos_storage_path_uidx"
    UNIQUE ("storage_path")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_photos_post_id_idx"
  ON "daily_reflection_photos" USING btree ("reflection_post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_photos_user_id_idx"
  ON "daily_reflection_photos" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_reflection_audience_friends" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reflection_post_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "friend_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "daily_reflection_audience_friends_reflection_post_id_daily_reflection_posts_id_fk"
    FOREIGN KEY ("reflection_post_id") REFERENCES "public"."daily_reflection_posts"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "daily_reflection_audience_friends_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "daily_reflection_audience_friends_friend_user_id_user_id_fk"
    FOREIGN KEY ("friend_user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "daily_reflection_audience_friends_post_friend_uidx"
    UNIQUE ("reflection_post_id", "friend_user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_audience_friends_post_id_idx"
  ON "daily_reflection_audience_friends" USING btree ("reflection_post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_audience_friends_user_id_idx"
  ON "daily_reflection_audience_friends" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_audience_friends_friend_user_id_idx"
  ON "daily_reflection_audience_friends" USING btree ("friend_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_reflection_audience_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reflection_post_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "group_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "daily_reflection_audience_groups_reflection_post_id_daily_reflection_posts_id_fk"
    FOREIGN KEY ("reflection_post_id") REFERENCES "public"."daily_reflection_posts"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "daily_reflection_audience_groups_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "daily_reflection_audience_groups_group_id_friend_groups_id_fk"
    FOREIGN KEY ("group_id") REFERENCES "public"."friend_groups"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "daily_reflection_audience_groups_post_group_uidx"
    UNIQUE ("reflection_post_id", "group_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_audience_groups_post_id_idx"
  ON "daily_reflection_audience_groups" USING btree ("reflection_post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_audience_groups_user_id_idx"
  ON "daily_reflection_audience_groups" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_audience_groups_group_id_idx"
  ON "daily_reflection_audience_groups" USING btree ("group_id");
