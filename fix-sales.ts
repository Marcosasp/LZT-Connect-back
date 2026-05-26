import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Vinculando vendas sem dono ao usuário principal...');

  const result = await prisma.sale.updateMany({
    where: {
      userId: null,
    },
    data: {
      userId: 'cmobrihq40000f2r6hgjt4nbc',
    },
  });

  console.log(`✅ ${result.count} venda(s) atualizada(s) com sucesso!`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Erro ao executar atualização:', error.message);
  process.exit(1);
});
