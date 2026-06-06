/**
 * One-shot script to remove e2e test data from the production Neon DB.
 * Run once: npx dotenv -e .env -- npx tsx src/prisma/cleanup-e2e-data.ts
 * Delete this file after running.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const testTitles = [
    'E2E Test Quotation',
    'Manager Quotation',
    'To Delete',
    'Rep Draft For Ownership Test',
  ];

  const deleted = await prisma.quotation.deleteMany({
    where: { title: { in: testTitles } },
  });
  console.log(`Deleted ${deleted.count} quotation(s) with e2e test titles.`);

  // Delete the test client created by e2e (email used in createClient mutation)
  const deletedClients = await prisma.client.deleteMany({
    where: { email: 'test@client.de' },
  });
  console.log(`Deleted ${deletedClients.count} test client(s).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
