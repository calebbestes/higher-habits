CREATE TYPE "public"."calendar_habit_key" AS ENUM('prayer', 'gym', 'outreach');--> statement-breakpoint
CREATE TYPE "public"."custom_day_icon_key" AS ENUM('tent', 'heart', 'party', 'lunch', 'phone', 'financialPlanning', 'firstAid', 'temple', 'book', 'walk', 'group', 'climb', 'tennis', 'cook', 'piano');--> statement-breakpoint
CREATE TYPE "public"."custom_day_icon_status" AS ENUM('planned', 'complete');--> statement-breakpoint
CREATE TYPE "public"."sales_channel" AS ENUM('call', 'email', 'dm', 'meeting');--> statement-breakpoint
CREATE TABLE "calendar_day_habits" (
	"date" date NOT NULL,
	"habit_key" "calendar_habit_key" NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_day_habits_date_habit_key_pk" PRIMARY KEY("date","habit_key")
);
--> statement-breakpoint
CREATE TABLE "custom_day_icon_selections" (
	"date" date PRIMARY KEY NOT NULL,
	"icon_key" "custom_day_icon_key" NOT NULL,
	"status" "custom_day_icon_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prayer_day_checklists" (
	"date" date PRIMARY KEY NOT NULL,
	"scriptures" boolean DEFAULT false NOT NULL,
	"prayer" boolean DEFAULT false NOT NULL,
	"clean_room" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_outreach_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"lead_name" text NOT NULL,
	"company" text NOT NULL,
	"channel" "sales_channel" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "calendar_day_habits_date_idx" ON "calendar_day_habits" USING btree ("date");--> statement-breakpoint
CREATE INDEX "custom_day_icon_selections_date_idx" ON "custom_day_icon_selections" USING btree ("date");--> statement-breakpoint
CREATE INDEX "prayer_day_checklists_date_idx" ON "prayer_day_checklists" USING btree ("date");--> statement-breakpoint
CREATE INDEX "sales_outreach_activities_date_idx" ON "sales_outreach_activities" USING btree ("date");