CREATE TABLE IF NOT EXISTS "goal_checkpoint_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "checkpoint_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "goal_checkpoint_links_checkpoint_id_goal_checkpoints_id_fk"
    FOREIGN KEY ("checkpoint_id") REFERENCES "public"."goal_checkpoints"("id") ON DELETE cascade,
  CONSTRAINT "goal_checkpoint_links_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade,
  CONSTRAINT "goal_checkpoint_links_source_uidx"
    UNIQUE ("checkpoint_id", "source_type", "source_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_checkpoint_links_checkpoint_id_idx"
  ON "goal_checkpoint_links" ("checkpoint_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_checkpoint_links_user_id_idx"
  ON "goal_checkpoint_links" ("user_id");
