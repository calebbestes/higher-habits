CREATE TABLE IF NOT EXISTS "friend_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_groups_owner_id_name_uidx" UNIQUE("owner_id","name")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friend_groups_owner_id_idx" ON "friend_groups" USING btree ("owner_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "friend_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL REFERENCES "friend_groups"("id") ON DELETE CASCADE,
	"member_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_group_members_group_id_member_user_id_uidx" UNIQUE("group_id","member_user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friend_group_members_group_id_idx" ON "friend_group_members" USING btree ("group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friend_group_members_member_user_id_idx" ON "friend_group_members" USING btree ("member_user_id");
