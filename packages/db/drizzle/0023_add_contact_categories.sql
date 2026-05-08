CREATE TABLE "contact_categories" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "contact_categories_user_id_name_uidx" UNIQUE("user_id", "name")
);

CREATE INDEX "contact_categories_user_id_idx" ON "contact_categories"("user_id");

ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_category_id_categories_id_fk";
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_category_id_contact_categories_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "contact_categories"("id") ON DELETE SET NULL;
