CREATE TABLE IF NOT EXISTS "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal" text NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"frequency" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_category_idx" ON "goals" USING btree ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_priority_idx" ON "goals" USING btree ("priority");
