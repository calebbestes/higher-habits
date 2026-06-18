CREATE TABLE IF NOT EXISTS "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"notify_friend_requests" boolean DEFAULT true NOT NULL,
	"notify_monthly_goal_today" boolean DEFAULT true NOT NULL,
	"notify_tasks_due_today" boolean DEFAULT true NOT NULL,
	"notify_inactivity_reminder" boolean DEFAULT true NOT NULL,
	"notify_shared_goal_invites" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
