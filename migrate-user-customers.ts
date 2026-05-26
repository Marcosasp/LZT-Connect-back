import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Verificando integridade: clientes sem userId...');

  const orphans = await prisma.customer.findMany({
    where: { userId: { equals: undefined } },
    select: { id: true, cpf: true, nome_completo: true },
  });

  if (orphans.length === 0) {
    console.log(
      '✅ Todos os clientes possuem userId. Nenhuma ação necessária.',
    );
    return;
  }

  console.log(`⚠️  Encontrado(s) ${orphans.length} cliente(s) sem userId:`);
  orphans.forEach((c) =>
    console.log(`   - id=${c.id} cpf=${c.cpf} nome=${c.nome_completo}`),
  );
  console.log('   Remova ou vincule esses registros manualmente.');
}

main()
  .catch((error) => {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
