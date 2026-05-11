ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "last_contact_attempt" date;
--> statement-breakpoint
UPDATE "contacts"
SET "last_contact_attempt" = CASE
    WHEN "last_contacted" IS NOT NULL
      AND "last_contacted" > "created_at"::date THEN "last_contacted"
    ELSE "created_at"::date
  END
WHERE "last_contact_attempt" IS NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "last_contact_attempt" SET DEFAULT CURRENT_DATE;
--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "last_contact_attempt" SET NOT NULL;
