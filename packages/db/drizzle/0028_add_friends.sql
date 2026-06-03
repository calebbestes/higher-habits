CREATE TABLE IF NOT EXISTS "friends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id_1" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"user_id_2" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	CONSTRAINT "friends_user_id_1_user_id_2_uidx" UNIQUE("user_id_1", "user_id_2")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friends_user_id_1_idx" ON "friends" USING btree ("user_id_1");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friends_user_id_2_idx" ON "friends" USING btree ("user_id_2");
