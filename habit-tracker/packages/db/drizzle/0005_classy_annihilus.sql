CREATE TYPE "public"."drawer_note_key" AS ENUM('prayer', 'gym', 'outreach', 'custom');--> statement-breakpoint
CREATE TABLE "day_drawer_notes" (
	"date" date NOT NULL,
	"drawer_key" "drawer_note_key" NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_drawer_notes_date_drawer_key_pk" PRIMARY KEY("date","drawer_key")
);
--> statement-breakpoint
CREATE INDEX "day_drawer_notes_date_idx" ON "day_drawer_notes" USING btree ("date");