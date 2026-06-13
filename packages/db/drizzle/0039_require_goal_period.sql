UPDATE "goals" SET "period" = 'weekly' WHERE "period" IS NULL;
ALTER TABLE "goals" ALTER COLUMN "period" SET DEFAULT 'daily';
ALTER TABLE "goals" ALTER COLUMN "period" SET NOT NULL;
