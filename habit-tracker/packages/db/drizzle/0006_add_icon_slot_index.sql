ALTER TABLE "custom_day_icon_selections" DROP CONSTRAINT "custom_day_icon_selections_pkey";--> statement-breakpoint
ALTER TABLE "custom_day_icon_selections" ADD COLUMN "slot_index" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "custom_day_icon_selections" ADD CONSTRAINT "custom_day_icon_selections_date_slot_pk" PRIMARY KEY("date","slot_index");
