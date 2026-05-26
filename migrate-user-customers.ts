import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Migrando vínculos customer.userId → UserCustomer...');

  // Busca todos os clientes que possuem userId definido
  const customers = await prisma.customer.findMany({
    where: { userId: { not: null } },
    select: { id: true, userId: true },
  });

  console.log(`   Encontrado(s): ${customers.length} cliente(s) com userId`);

  if (customers.length === 0) {
    console.log('   Nenhum dado para migrar.');
    return;
  }

  // Insere todos de uma vez; skipDuplicates ignora conflitos na @@unique([userId, customerId])
  const { count } = await prisma.userCustomer.createMany({
    data: customers.map((c) => ({
      userId: c.userId as string,
      customerId: c.id,
    })),
    skipDuplicates: true,
  });

  const skipped = customers.length - count;
  console.log(
    `✅ Migração concluída: ${count} criado(s), ${skipped} já existia(m).`,
  );
}

main()
  .catch((error) => {
    console.error('❌ Erro durante a migração:', error.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
