import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TARGET_USER_ID = 'cmobrihq40000f2r6hgjt4nbc';
const FROM_STATUS = 'APPROVED';
const TO_STATUS = 'PENDING';

function isJsonObject(
  value: Prisma.JsonValue | null,
): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function main() {
  console.log(
    'Updating sales status from APPROVED to PENDING for target user...',
  );

  const sales = await prisma.sale.findMany({
    where: {
      userId: TARGET_USER_ID,
    },
    select: {
      id: true,
      servicesData: true,
    },
  });

  let updated = 0;

  for (const sale of sales) {
    if (!isJsonObject(sale.servicesData)) {
      continue;
    }

    const currentStatus = String(sale.servicesData.status ?? '')
      .trim()
      .toUpperCase();

    if (currentStatus !== FROM_STATUS) {
      continue;
    }

    const nextServicesData: Prisma.InputJsonValue = {
      ...sale.servicesData,
      status: TO_STATUS,
    };

    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        servicesData: nextServicesData,
      },
    });

    updated += 1;
  }

  console.log(`Done. Updated ${updated} sale(s).`);
}

main()
  .catch((error) => {
    console.error(
      'Error updating sales status:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
