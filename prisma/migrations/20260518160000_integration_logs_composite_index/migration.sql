-- Drop old separate indexes
DROP INDEX IF EXISTS "integration_logs_sale_id_idx";
DROP INDEX IF EXISTS "integration_logs_timestamp_idx";

-- Create composite index optimized for paginated queries:
-- WHERE sale_id = ? ORDER BY timestamp DESC
CREATE INDEX "integration_logs_sale_id_timestamp_idx"
  ON "integration_logs" ("sale_id", "timestamp" DESC);
