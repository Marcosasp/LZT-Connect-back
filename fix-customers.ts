import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Vinculando clientes sem dono ao usuário principal...');

  const result = await prisma.customer.updateMany({
    where: {
      userId: null,
    },
    data: {
      userId: 'cmobrihq40000f2r6hgjt4nbc',
    },
  });

  console.log(`✅ ${result.count} cliente(s) atualizado(s) com sucesso!`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Erro ao executar atualização:', error.message);
  process.exit(1);
});
