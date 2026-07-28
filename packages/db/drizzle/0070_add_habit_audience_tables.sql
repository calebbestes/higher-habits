CREATE TABLE IF NOT EXISTS "habit_audience_friends" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "habit_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "friend_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "habit_audience_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "habit_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "group_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "habit_audience_friends" ADD CONSTRAINT "habit_audience_friends_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "habit_audience_friends" ADD CONSTRAINT "habit_audience_friends_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "habit_audience_friends" ADD CONSTRAINT "habit_audience_friends_friend_user_id_user_id_fk" FOREIGN KEY ("friend_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "habit_audience_groups" ADD CONSTRAINT "habit_audience_groups_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "habit_audience_groups" ADD CONSTRAINT "habit_audience_groups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "habit_audience_groups" ADD CONSTRAINT "habit_audience_groups_group_id_friend_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."friend_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habit_audience_friends_habit_id_idx" ON "habit_audience_friends" USING btree ("habit_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habit_audience_friends_user_id_idx" ON "habit_audience_friends" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habit_audience_friends_friend_user_id_idx" ON "habit_audience_friends" USING btree ("friend_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "habit_audience_friends_habit_friend_uidx" ON "habit_audience_friends" USING btree ("habit_id","friend_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habit_audience_groups_habit_id_idx" ON "habit_audience_groups" USING btree ("habit_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habit_audience_groups_user_id_idx" ON "habit_audience_groups" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habit_audience_groups_group_id_idx" ON "habit_audience_groups" USING btree ("group_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "habit_audience_groups_habit_group_uidx" ON "habit_audience_groups" USING btree ("habit_id","group_id");
