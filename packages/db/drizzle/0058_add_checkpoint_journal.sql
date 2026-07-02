ALTER TABLE "goal_checkpoints" ADD COLUMN IF NOT EXISTS "notes" text;--> statement-breakpoint
ALTER TABLE "goal_checkpoints" ADD COLUMN IF NOT EXISTS "visibility" "goal_visibility" DEFAULT 'only_me' NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goal_checkpoint_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"storage_path" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_checkpoint_photos_storage_path_uidx" UNIQUE("storage_path")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goal_checkpoint_photos" ADD CONSTRAINT "goal_checkpoint_photos_checkpoint_id_goal_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."goal_checkpoints"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goal_checkpoint_photos" ADD CONSTRAINT "goal_checkpoint_photos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_checkpoint_photos_checkpoint_id_idx" ON "goal_checkpoint_photos" USING btree ("checkpoint_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_checkpoint_photos_user_id_idx" ON "goal_checkpoint_photos" USING btree ("user_id");
