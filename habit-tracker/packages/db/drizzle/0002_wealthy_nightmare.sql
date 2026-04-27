CREATE TABLE "weight_day_checklists" (
	"date" date PRIMARY KEY NOT NULL,
	"gym" boolean DEFAULT false NOT NULL,
	"calories_2300" boolean DEFAULT false NOT NULL,
	"wake_up_at_seven" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "weight_day_checklists_date_idx" ON "weight_day_checklists" USING btree ("date");