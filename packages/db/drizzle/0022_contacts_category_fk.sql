ALTER TABLE "contacts" ADD COLUMN "category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL;
ALTER TABLE "contacts" DROP COLUMN "category";
DROP INDEX IF EXISTS "contacts_category_idx";
CREATE INDEX "contacts_category_id_idx" ON "contacts"("category_id");
