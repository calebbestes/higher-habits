CREATE TABLE IF NOT EXISTS "weekly_plan_note_headers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_plan_note_headers_user_text_uidx" UNIQUE("user_id","text")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "weekly_plan_note_headers" ADD CONSTRAINT "weekly_plan_note_headers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "weekly_plan_note_headers_user_id_idx" ON "weekly_plan_note_headers" ("user_id");
