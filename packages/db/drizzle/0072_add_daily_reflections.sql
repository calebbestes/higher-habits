CREATE TABLE IF NOT EXISTS "daily_reflection_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "prompt" text NOT NULL,
  "body" text NOT NULL,
  "visibility" "goal_visibility" DEFAULT 'all_friends' NOT NULL,
  "date" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "daily_reflection_posts_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_posts_user_id_idx"
  ON "daily_reflection_posts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_posts_date_idx"
  ON "daily_reflection_posts" USING btree ("date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_posts_updated_at_idx"
  ON "daily_reflection_posts" USING btree ("updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_reflection_props" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reflection_post_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "daily_reflection_props_reflection_post_id_daily_reflection_posts_id_fk"
    FOREIGN KEY ("reflection_post_id") REFERENCES "public"."daily_reflection_posts"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "daily_reflection_props_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "daily_reflection_props_post_user_uidx"
    UNIQUE ("reflection_post_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_props_post_id_idx"
  ON "daily_reflection_props" USING btree ("reflection_post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_props_user_id_idx"
  ON "daily_reflection_props" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_reflection_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reflection_post_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "parent_comment_id" uuid,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "daily_reflection_comments_reflection_post_id_daily_reflection_posts_id_fk"
    FOREIGN KEY ("reflection_post_id") REFERENCES "public"."daily_reflection_posts"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "daily_reflection_comments_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "daily_reflection_comments_parent_comment_id_daily_reflection_comments_id_fk"
    FOREIGN KEY ("parent_comment_id") REFERENCES "public"."daily_reflection_comments"("id")
    ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_comments_post_id_idx"
  ON "daily_reflection_comments" USING btree ("reflection_post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_comments_parent_comment_id_idx"
  ON "daily_reflection_comments" USING btree ("parent_comment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_reflection_comments_user_id_idx"
  ON "daily_reflection_comments" USING btree ("user_id");
