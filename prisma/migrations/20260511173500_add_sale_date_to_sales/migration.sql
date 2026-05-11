ALTER TABLE "sales"
ADD COLUMN "sale_date" TIMESTAMP(3);

UPDATE "sales"
SET "sale_date" = "departure_date"
WHERE "sale_date" IS NULL;

CREATE INDEX "sales_sale_date_idx" ON "sales"("sale_date");
