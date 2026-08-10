ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "first_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "last_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE "user"
SET
  "first_name" = CASE
    WHEN trim(coalesce("first_name", '')) <> '' THEN "first_name"
    WHEN trim(coalesce("name", '')) = '' THEN ''
    ELSE split_part(trim("name"), ' ', 1)
  END,
  "last_name" = CASE
    WHEN trim(coalesce("last_name", '')) <> '' THEN "last_name"
    WHEN trim(coalesce("name", '')) = '' THEN ''
    WHEN strpos(trim("name"), ' ') = 0 THEN ''
    ELSE trim(substr(trim("name"), length(split_part(trim("name"), ' ', 1)) + 2))
  END
WHERE trim(coalesce("first_name", '')) = ''
  OR trim(coalesce("last_name", '')) = '';
