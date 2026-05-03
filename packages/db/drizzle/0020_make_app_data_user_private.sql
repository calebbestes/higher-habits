ALTER TABLE "calendar_day_habits" ADD COLUMN "user_id" text;
ALTER TABLE "prayer_day_checklists" ADD COLUMN "user_id" text;
ALTER TABLE "weight_day_checklists" ADD COLUMN "user_id" text;
ALTER TABLE "custom_day_icon_selections" ADD COLUMN "user_id" text;
ALTER TABLE "day_drawer_notes" ADD COLUMN "user_id" text;
ALTER TABLE "sales_day_checklists" ADD COLUMN "user_id" text;
ALTER TABLE "sales_outreach_activities" ADD COLUMN "user_id" text;
ALTER TABLE "contacts" ADD COLUMN "user_id" text;

CREATE TEMP TABLE "_migration_caleb_user" AS
SELECT "id" AS "user_id"
FROM "user"
WHERE "email" = 'estes.caleb.b@gmail.com'
  AND "name" = 'Caleb Estes'
LIMIT 1;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "_migration_caleb_user") THEN
        RAISE EXCEPTION 'Could not find Better Auth user for Caleb Estes <estes.caleb.b@gmail.com>.';
    END IF;
END $$;

INSERT INTO "categories" ("user_id", "name", "icon", "created_at")
SELECT
    (SELECT "user_id" FROM "_migration_caleb_user"),
    "legacy"."target_name",
    MAX("legacy"."icon"),
    NOW()
FROM (
    SELECT
        CASE
            WHEN lower("name") = 'health' THEN 'Physical'
            ELSE "name"
        END AS "target_name",
        "icon"
    FROM "categories"
    WHERE "user_id" IS NULL
) AS "legacy"
WHERE NOT EXISTS (
    SELECT 1
    FROM "categories" AS "existing"
    WHERE "existing"."user_id" = (SELECT "user_id" FROM "_migration_caleb_user")
      AND lower("existing"."name") = lower("legacy"."target_name")
)
GROUP BY "legacy"."target_name";

CREATE TEMP TABLE "_migration_legacy_categories" AS
SELECT
    "legacy"."id" AS "legacy_category_id",
    "target"."id" AS "target_category_id"
FROM "categories" AS "legacy"
JOIN LATERAL (
    SELECT "existing"."id"
    FROM "categories" AS "existing"
    WHERE "existing"."user_id" = (SELECT "user_id" FROM "_migration_caleb_user")
      AND lower("existing"."name") = lower(
          CASE
              WHEN lower("legacy"."name") = 'health' THEN 'Physical'
              ELSE "legacy"."name"
          END
      )
    ORDER BY "existing"."created_at" ASC, "existing"."id" ASC
    LIMIT 1
) AS "target" ON TRUE
WHERE "legacy"."user_id" IS NULL;

CREATE TEMP TABLE "_migration_goal_merges" AS
SELECT
    "legacy"."id" AS "legacy_goal_id",
    "existing"."id" AS "target_goal_id"
FROM "goals" AS "legacy"
JOIN "_migration_legacy_categories" AS "cat_map"
  ON "cat_map"."legacy_category_id" = "legacy"."category_id"
JOIN LATERAL (
    SELECT "goal"."id"
    FROM "goals" AS "goal"
    WHERE "goal"."user_id" = (SELECT "user_id" FROM "_migration_caleb_user")
      AND "goal"."category_id" = "cat_map"."target_category_id"
      AND lower("goal"."name") = lower("legacy"."name")
    ORDER BY "goal"."created_at" ASC, "goal"."id" ASC
    LIMIT 1
) AS "existing" ON TRUE
WHERE "legacy"."user_id" IS NULL;

UPDATE "goal_logs" AS "log"
SET
    "goal_id" = "merge"."target_goal_id",
    "user_id" = (SELECT "user_id" FROM "_migration_caleb_user"),
    "updated_at" = NOW()
FROM "_migration_goal_merges" AS "merge"
WHERE "log"."goal_id" = "merge"."legacy_goal_id"
  AND "log"."user_id" IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM "goal_logs" AS "existing"
      WHERE "existing"."goal_id" = "merge"."target_goal_id"
        AND "existing"."date" = "log"."date"
        AND "existing"."id" <> "log"."id"
  );

DELETE FROM "goal_logs" AS "log"
USING "_migration_goal_merges" AS "merge"
WHERE "log"."goal_id" = "merge"."legacy_goal_id"
  AND "log"."user_id" IS NULL;

DELETE FROM "goals" AS "goal"
USING "_migration_goal_merges" AS "merge"
WHERE "goal"."id" = "merge"."legacy_goal_id";

UPDATE "goals" AS "goal"
SET
    "user_id" = (SELECT "user_id" FROM "_migration_caleb_user"),
    "category_id" = "cat_map"."target_category_id",
    "updated_at" = NOW()
FROM "_migration_legacy_categories" AS "cat_map"
WHERE "goal"."user_id" IS NULL
  AND "goal"."category_id" = "cat_map"."legacy_category_id";

UPDATE "goal_logs"
SET
    "user_id" = (SELECT "user_id" FROM "_migration_caleb_user"),
    "updated_at" = NOW()
WHERE "user_id" IS NULL;

DELETE FROM "goal_preferences" AS "legacy"
USING "goal_preferences" AS "existing"
WHERE "legacy"."user_id" IS NULL
  AND "existing"."user_id" = (SELECT "user_id" FROM "_migration_caleb_user")
  AND "existing"."goal_key" = "legacy"."goal_key";

UPDATE "goal_preferences"
SET
    "user_id" = (SELECT "user_id" FROM "_migration_caleb_user"),
    "updated_at" = NOW()
WHERE "user_id" IS NULL;

DELETE FROM "categories"
WHERE "user_id" IS NULL;

UPDATE "calendar_day_habits"
SET "user_id" = (SELECT "user_id" FROM "_migration_caleb_user")
WHERE "user_id" IS NULL;

UPDATE "prayer_day_checklists"
SET "user_id" = (SELECT "user_id" FROM "_migration_caleb_user")
WHERE "user_id" IS NULL;

UPDATE "weight_day_checklists"
SET "user_id" = (SELECT "user_id" FROM "_migration_caleb_user")
WHERE "user_id" IS NULL;

UPDATE "custom_day_icon_selections"
SET "user_id" = (SELECT "user_id" FROM "_migration_caleb_user")
WHERE "user_id" IS NULL;

UPDATE "day_drawer_notes"
SET "user_id" = (SELECT "user_id" FROM "_migration_caleb_user")
WHERE "user_id" IS NULL;

UPDATE "sales_day_checklists"
SET "user_id" = (SELECT "user_id" FROM "_migration_caleb_user")
WHERE "user_id" IS NULL;

UPDATE "sales_outreach_activities"
SET "user_id" = (SELECT "user_id" FROM "_migration_caleb_user")
WHERE "user_id" IS NULL;

UPDATE "contacts"
SET "user_id" = (SELECT "user_id" FROM "_migration_caleb_user")
WHERE "user_id" IS NULL;

ALTER TABLE "calendar_day_habits" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "prayer_day_checklists" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "weight_day_checklists" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "custom_day_icon_selections" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "day_drawer_notes" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "sales_day_checklists" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "sales_outreach_activities" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "contacts" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "goal_preferences" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "categories" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "goals" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "goal_logs" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "calendar_day_habits" DROP CONSTRAINT "calendar_day_habits_date_habit_key_pk";
ALTER TABLE "calendar_day_habits" ADD CONSTRAINT "calendar_day_habits_user_date_habit_key_pk" PRIMARY KEY("user_id","date","habit_key");

ALTER TABLE "prayer_day_checklists" DROP CONSTRAINT "prayer_day_checklists_pkey";
ALTER TABLE "prayer_day_checklists" ADD CONSTRAINT "prayer_day_checklists_user_date_pk" PRIMARY KEY("user_id","date");

ALTER TABLE "weight_day_checklists" DROP CONSTRAINT "weight_day_checklists_pkey";
ALTER TABLE "weight_day_checklists" ADD CONSTRAINT "weight_day_checklists_user_date_pk" PRIMARY KEY("user_id","date");

ALTER TABLE "custom_day_icon_selections" DROP CONSTRAINT "custom_day_icon_selections_date_slot_pk";
ALTER TABLE "custom_day_icon_selections" ADD CONSTRAINT "custom_day_icon_selections_user_date_slot_pk" PRIMARY KEY("user_id","date","slot_index");

ALTER TABLE "day_drawer_notes" DROP CONSTRAINT "day_drawer_notes_date_drawer_key_pk";
ALTER TABLE "day_drawer_notes" ADD CONSTRAINT "day_drawer_notes_user_date_drawer_key_pk" PRIMARY KEY("user_id","date","drawer_key");

ALTER TABLE "sales_day_checklists" DROP CONSTRAINT "sales_day_checklists_pkey";
ALTER TABLE "sales_day_checklists" ADD CONSTRAINT "sales_day_checklists_user_date_pk" PRIMARY KEY("user_id","date");

ALTER TABLE "calendar_day_habits" ADD CONSTRAINT "calendar_day_habits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "prayer_day_checklists" ADD CONSTRAINT "prayer_day_checklists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "weight_day_checklists" ADD CONSTRAINT "weight_day_checklists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "custom_day_icon_selections" ADD CONSTRAINT "custom_day_icon_selections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "day_drawer_notes" ADD CONSTRAINT "day_drawer_notes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sales_day_checklists" ADD CONSTRAINT "sales_day_checklists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sales_outreach_activities" ADD CONSTRAINT "sales_outreach_activities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

DROP INDEX IF EXISTS "calendar_day_habits_date_idx";
DROP INDEX IF EXISTS "prayer_day_checklists_date_idx";
DROP INDEX IF EXISTS "weight_day_checklists_date_idx";
DROP INDEX IF EXISTS "custom_day_icon_selections_date_idx";
DROP INDEX IF EXISTS "day_drawer_notes_date_idx";
DROP INDEX IF EXISTS "sales_day_checklists_date_idx";
DROP INDEX IF EXISTS "sales_outreach_activities_date_idx";

CREATE INDEX "calendar_day_habits_user_id_idx" ON "calendar_day_habits" USING btree ("user_id");
CREATE INDEX "calendar_day_habits_user_date_idx" ON "calendar_day_habits" USING btree ("user_id","date");
CREATE INDEX "prayer_day_checklists_user_id_idx" ON "prayer_day_checklists" USING btree ("user_id");
CREATE INDEX "prayer_day_checklists_user_date_idx" ON "prayer_day_checklists" USING btree ("user_id","date");
CREATE INDEX "weight_day_checklists_user_id_idx" ON "weight_day_checklists" USING btree ("user_id");
CREATE INDEX "weight_day_checklists_user_date_idx" ON "weight_day_checklists" USING btree ("user_id","date");
CREATE INDEX "custom_day_icon_selections_user_id_idx" ON "custom_day_icon_selections" USING btree ("user_id");
CREATE INDEX "custom_day_icon_selections_user_date_idx" ON "custom_day_icon_selections" USING btree ("user_id","date");
CREATE INDEX "day_drawer_notes_user_id_idx" ON "day_drawer_notes" USING btree ("user_id");
CREATE INDEX "day_drawer_notes_user_date_idx" ON "day_drawer_notes" USING btree ("user_id","date");
CREATE INDEX "sales_day_checklists_user_id_idx" ON "sales_day_checklists" USING btree ("user_id");
CREATE INDEX "sales_day_checklists_user_date_idx" ON "sales_day_checklists" USING btree ("user_id","date");
CREATE INDEX "sales_outreach_activities_user_id_idx" ON "sales_outreach_activities" USING btree ("user_id");
CREATE INDEX "sales_outreach_activities_user_date_idx" ON "sales_outreach_activities" USING btree ("user_id","date");
CREATE INDEX "contacts_user_id_idx" ON "contacts" USING btree ("user_id");

DROP TABLE "_migration_goal_merges";
DROP TABLE "_migration_legacy_categories";
DROP TABLE "_migration_caleb_user";
