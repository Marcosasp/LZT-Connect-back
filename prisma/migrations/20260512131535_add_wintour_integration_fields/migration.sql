-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "customer_source" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN     "user_id" TEXT;

-- CreateIndex
CREATE INDEX "sales_user_id_idx" ON "sales"("user_id");

-- CreateIndex
CREATE INDEX "sales_customer_source_idx" ON "sales"("customer_source");
