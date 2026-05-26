-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "integration_key" TEXT;

-- CreateIndex
CREATE INDEX "sales_integration_key_idx" ON "sales"("integration_key");
