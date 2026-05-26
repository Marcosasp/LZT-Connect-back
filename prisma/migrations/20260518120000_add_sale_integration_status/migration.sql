CREATE TYPE "IntegrationStatus" AS ENUM ('pending', 'processing', 'success', 'error', 'manual_pending');

ALTER TABLE "sales"
  ADD COLUMN "integration_status" "IntegrationStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_error_message" TEXT,
  ADD COLUMN "last_integration_at" TIMESTAMP(3);

CREATE INDEX "sales_integration_status_idx" ON "sales"("integration_status");