import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('password123', 10);

  await prisma.user.upsert({
    where: { email: 'marcus@quoteiq.com' },
    update: {},
    create: { name: 'Marcus Reid', email: 'marcus@quoteiq.com', password: hash, role: Role.SALES_MANAGER },
  });

  await prisma.user.upsert({
    where: { email: 'anna@quoteiq.com' },
    update: {},
    create: { name: 'Anna Schmidt', email: 'anna@quoteiq.com', password: hash, role: Role.SALES_REP },
  });

  console.log('CI seed complete: marcus@quoteiq.com (SALES_MANAGER), anna@quoteiq.com (SALES_REP)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
