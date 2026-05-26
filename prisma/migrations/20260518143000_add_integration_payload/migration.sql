-- AddColumn integration_payload to sales table
ALTER TABLE "sales" ADD COLUMN "integration_payload" JSONB;

-- Create index for queries filtering by integration_payload
CREATE INDEX "idx_sales_integration_payload" ON "sales" USING GIN ("integration_payload");
