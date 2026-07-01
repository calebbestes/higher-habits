CREATE TABLE IF NOT EXISTS "planned_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"planned_start_time" text,
	"planned_end_time" text,
	"google_calendar_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planned_events_user_source_uidx" UNIQUE("user_id","source_type","source_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planned_events" ADD CONSTRAINT "planned_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planned_events_user_id_idx" ON "planned_events" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planned_events_date_idx" ON "planned_events" ("date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planned_events_source_idx" ON "planned_events" ("source_type","source_id");
