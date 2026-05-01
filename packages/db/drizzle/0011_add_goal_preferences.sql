CREATE TABLE "goal_preferences" (
	"goal_key" text PRIMARY KEY NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
