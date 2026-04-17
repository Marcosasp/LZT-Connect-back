-- Rename customers table to clientes
ALTER TABLE "customers" RENAME TO "clientes";

-- Keep conventional names aligned with the new table name
ALTER TABLE "clientes" RENAME CONSTRAINT "customers_pkey" TO "clientes_pkey";
ALTER INDEX "customers_cpf_key" RENAME TO "clientes_cpf_key";
