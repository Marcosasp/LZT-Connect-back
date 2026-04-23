-- DropIndex
DROP INDEX IF EXISTS "customers_email_key";

-- AlterTable
ALTER TABLE "customers"
ADD COLUMN     "nome_completo" TEXT,
ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "telefone_celular" TEXT,
ADD COLUMN     "logradouro" TEXT,
ADD COLUMN     "data_criacao_usuario" TIMESTAMP(3);

UPDATE "customers"
SET
  "nome_completo" = COALESCE("razao_social", 'Cliente sem nome'),
  "cpf" = CASE
    WHEN LENGTH(REGEXP_REPLACE(COALESCE("cpf_cnpj", ''), '\\D', '', 'g')) >= 11
      THEN SUBSTRING(REGEXP_REPLACE(COALESCE("cpf_cnpj", ''), '\\D', '', 'g') FROM 1 FOR 11)
    ELSE LPAD(REGEXP_REPLACE(COALESCE("cpf_cnpj", ''), '\\D', '', 'g'), 11, '0')
  END,
  "telefone_celular" = CASE
    WHEN LENGTH(REGEXP_REPLACE(COALESCE("celular", "tel", ''), '\\D', '', 'g')) >= 10
      THEN REGEXP_REPLACE(COALESCE("celular", "tel", ''), '\\D', '', 'g')
    ELSE '0000000000'
  END,
  "endereco" = COALESCE("endereco", 'Nao informado'),
  "cep" = CASE
    WHEN LENGTH(REGEXP_REPLACE(COALESCE("cep", ''), '\\D', '', 'g')) = 8
      THEN REGEXP_REPLACE(COALESCE("cep", ''), '\\D', '', 'g')
    ELSE '00000000'
  END,
  "logradouro" = COALESCE("endereco", 'Nao informado'),
  "bairro" = COALESCE("bairro", 'Nao informado'),
  "cidade" = COALESCE("cidade", 'Nao informado'),
  "estado" = CASE
    WHEN LENGTH(TRIM(COALESCE("estado", ''))) >= 2
      THEN UPPER(SUBSTRING(TRIM(COALESCE("estado", '')) FROM 1 FOR 2))
    ELSE 'NA'
  END,
  "email" = COALESCE(NULLIF(TRIM("email"), ''), CONCAT('cliente_', "id", '@invalid.local')),
  "data_criacao_usuario" = COALESCE("dt_cadastro", "created_at");

ALTER TABLE "customers"
ALTER COLUMN "nome_completo" SET NOT NULL,
ALTER COLUMN "cpf" SET NOT NULL,
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "telefone_celular" SET NOT NULL,
ALTER COLUMN "endereco" SET NOT NULL,
ALTER COLUMN "cep" SET NOT NULL,
ALTER COLUMN "logradouro" SET NOT NULL,
ALTER COLUMN "bairro" SET NOT NULL,
ALTER COLUMN "cidade" SET NOT NULL,
ALTER COLUMN "estado" SET NOT NULL,
ALTER COLUMN "data_criacao_usuario" SET NOT NULL,
ALTER COLUMN "data_criacao_usuario" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "customers"
DROP COLUMN "acao_cli",
DROP COLUMN "razao_social",
DROP COLUMN "tipo_endereco",
DROP COLUMN "numero",
DROP COLUMN "complemento",
DROP COLUMN "tipo_fj",
DROP COLUMN "dt_nasc",
DROP COLUMN "tel",
DROP COLUMN "celular",
DROP COLUMN "cpf_cnpj",
DROP COLUMN "insc_identidade",
DROP COLUMN "sexo",
DROP COLUMN "dt_cadastro";

-- CreateIndex
CREATE UNIQUE INDEX "customers_cpf_key" ON "customers"("cpf");
