CREATE TABLE "sales_day_checklists" (
	"date" date PRIMARY KEY NOT NULL,
	"cold_emails" boolean DEFAULT false NOT NULL,
	"linkedin_messages" boolean DEFAULT false NOT NULL,
	"prospective_clients" boolean DEFAULT false NOT NULL,
	"cold_call_or_visit" boolean DEFAULT false NOT NULL,
	"study_coding" boolean DEFAULT false NOT NULL,
	"work_for_ey" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sales_day_checklists_date_idx" ON "sales_day_checklists" USING btree ("date");