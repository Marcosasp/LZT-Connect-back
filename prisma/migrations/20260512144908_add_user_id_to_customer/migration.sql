-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "user_id" TEXT;

-- CreateIndex
CREATE INDEX "clientes_user_id_idx" ON "clientes"("user_id");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
