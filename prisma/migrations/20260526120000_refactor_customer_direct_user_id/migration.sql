-- Refatoração: remove UserCustomer (pivot) e adiciona user_id direto em Customer.
-- Garante isolamento de clientes por usuário com unicidade (cpf, user_id).

-- Step 1: Adiciona user_id como nullable inicialmente
ALTER TABLE "clientes" ADD COLUMN "user_id" TEXT;

-- Step 2: Remove índice único global de cpf ANTES de inserir duplicatas
-- (necessário para permitir mesmo CPF para usuários diferentes)
DROP INDEX IF EXISTS "lztconnect"."clientes_cpf_key";

-- Step 3: Para cada customer, atribui o primeiro user_id encontrado em user_customers
UPDATE "clientes" c
SET "user_id" = (
  SELECT uc."user_id"
  FROM "user_customers" uc
  WHERE uc."customer_id" = c."id"
  ORDER BY uc."created_at" ASC
  LIMIT 1
);

-- Step 4: Duplica customers vinculados a mais de um usuário (um registro por usuário extra)
INSERT INTO "clientes" (
  "id", "created_at", "updated_at", "user_id",
  "endereco", "bairro", "cep", "cidade", "estado",
  "email", "nome_completo", "cpf", "telefone_celular",
  "logradouro", "data_criacao_usuario", "razao_social"
)
SELECT
  gen_random_uuid()::text,
  c."created_at",
  c."updated_at",
  uc."user_id",
  c."endereco",
  c."bairro",
  c."cep",
  c."cidade",
  c."estado",
  c."email",
  c."nome_completo",
  c."cpf",
  c."telefone_celular",
  c."logradouro",
  c."data_criacao_usuario",
  c."razao_social"
FROM "user_customers" uc
JOIN "clientes" c ON c."id" = uc."customer_id"
WHERE uc."user_id" != (
  SELECT uc2."user_id"
  FROM "user_customers" uc2
  WHERE uc2."customer_id" = uc."customer_id"
  ORDER BY uc2."created_at" ASC
  LIMIT 1
);

-- Step 5: Remove clientes órfãos (sem nenhum vínculo em user_customers)
DELETE FROM "clientes" WHERE "user_id" IS NULL;

-- Step 6: Torna user_id NOT NULL
ALTER TABLE "clientes" ALTER COLUMN "user_id" SET NOT NULL;

-- Step 7: Adiciona constraint de unicidade composta (cpf, user_id)
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_cpf_user_id_key" UNIQUE ("cpf", "user_id");

-- Step 8: Adiciona índice em user_id
CREATE INDEX "clientes_user_id_idx" ON "clientes"("user_id");

-- Step 9: Adiciona FK de user_id → users.id
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 10: Remove tabela user_customers
DROP TABLE "user_customers";
