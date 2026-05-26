/*
  Warnings:

  - You are about to drop the column `user_id` on the `clientes` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "clientes" DROP CONSTRAINT "clientes_user_id_fkey";

-- DropIndex
DROP INDEX "clientes_user_id_idx";

-- AlterTable
ALTER TABLE "clientes" DROP COLUMN "user_id";

-- CreateTable
CREATE TABLE "user_customers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_customers_user_id_idx" ON "user_customers"("user_id");

-- CreateIndex
CREATE INDEX "user_customers_customer_id_idx" ON "user_customers"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_customers_user_id_customer_id_key" ON "user_customers"("user_id", "customer_id");

-- AddForeignKey
ALTER TABLE "user_customers" ADD CONSTRAINT "user_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_customers" ADD CONSTRAINT "user_customers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
