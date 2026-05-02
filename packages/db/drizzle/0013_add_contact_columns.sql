ALTER TABLE "contacts" ADD COLUMN "status" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "priority" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "last_response" date;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "last_contacted" date;
