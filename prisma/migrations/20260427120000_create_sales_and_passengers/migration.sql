CREATE TYPE "TravelType" AS ENUM ('ONE_WAY', 'ROUND_TRIP', 'MULTI_CITY');

CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "customer_id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "departure_date" TIMESTAMP(3) NOT NULL,
    "return_date" TIMESTAMP(3),
    "travel_type" "TravelType" NOT NULL,
    "services_data" JSONB,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "passengers" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sale_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,

    CONSTRAINT "passengers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");

CREATE INDEX "passengers_sale_id_idx" ON "passengers"("sale_id");

ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "passengers" ADD CONSTRAINT "passengers_sale_id_fkey"
FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;