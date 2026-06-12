ALTER TABLE "goals" ADD COLUMN "repeat_interval" integer;
ALTER TABLE "goals" ADD COLUMN "repeat_days" json;
ALTER TABLE "goals" ADD COLUMN "repeat_monthly_type" text;
