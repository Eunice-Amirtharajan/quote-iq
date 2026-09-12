import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const E2E_PREFIXES = ['E2E', 'Status-Test-'];
  for (const prefix of E2E_PREFIXES) {
    await prisma.quotationItem.deleteMany({
      where: { quotation: { title: { startsWith: prefix } } },
    });
    await prisma.quotation.deleteMany({
      where: { title: { startsWith: prefix } },
    });
  }
  console.log('E2E data cleaned up.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
