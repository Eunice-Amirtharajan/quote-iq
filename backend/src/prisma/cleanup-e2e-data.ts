import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const E2E_PREFIXES = ['E2E', 'Status-Test-', 'Pipeline-Test-'];
  for (const prefix of E2E_PREFIXES) {
    await prisma.quotationItem.deleteMany({
      where: { quotation: { title: { startsWith: prefix } } },
    });
    await prisma.quotation.deleteMany({
      where: { title: { startsWith: prefix } },
    });
  }

  // password-reset.spec.ts's invite tests create users named 'E2E ...' via
  // inviteUser — these aren't quotations so the loop above never touches them.
  // Without this, repeated local runs against a persistent DB can match a
  // stale user from a prior run instead of the one just created, since the
  // tests search by a fixed name (not the unique per-run email).
  await prisma.user.deleteMany({
    where: { name: { startsWith: 'E2E' } },
  });

  console.log('E2E data cleaned up.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
