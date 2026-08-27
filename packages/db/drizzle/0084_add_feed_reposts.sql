CREATE TABLE IF NOT EXISTS "feed_reposts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_reposts_user_source_uidx" UNIQUE("user_id","source_type","source_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feed_reposts" ADD CONSTRAINT "feed_reposts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feed_reposts_source_idx" ON "feed_reposts" ("source_type","source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feed_reposts_user_id_idx" ON "feed_reposts" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feed_reposts_created_at_idx" ON "feed_reposts" ("created_at");
