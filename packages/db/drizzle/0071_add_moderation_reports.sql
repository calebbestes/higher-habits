CREATE TYPE "public"."moderation_report_target_type" AS ENUM('feed_post', 'feed_comment', 'user', 'ad', 'general');
--> statement-breakpoint
CREATE TYPE "public"."moderation_report_status" AS ENUM('open', 'reviewed', 'dismissed', 'actioned');
--> statement-breakpoint
CREATE TABLE "moderation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" text NOT NULL,
	"target_type" "moderation_report_target_type" NOT NULL,
	"target_id" text,
	"reason" text NOT NULL,
	"context" json DEFAULT '{}',
	"status" "moderation_report_status" DEFAULT 'open' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "moderation_reports_reporter_id_idx" ON "moderation_reports" USING btree ("reporter_id");
--> statement-breakpoint
CREATE INDEX "moderation_reports_status_created_at_idx" ON "moderation_reports" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX "moderation_reports_target_idx" ON "moderation_reports" USING btree ("target_type","target_id");
