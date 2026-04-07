import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding...');

  const hash = await bcrypt.hash('password123', 10);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [anna, tom] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'marcus@quoteiq.com' },
      update: {},
      create: {
        name: 'Marcus Klein',
        email: 'marcus@quoteiq.com',
        password: hash,
        role: Role.SALES_MANAGER,
      },
    }),
    prisma.user.upsert({
      where: { email: 'anna@quoteiq.com' },
      update: {},
      create: {
        name: 'Anna Schmidt',
        email: 'anna@quoteiq.com',
        password: hash,
        role: Role.SALES_REP,
      },
    }),
    prisma.user.upsert({
      where: { email: 'tom@quoteiq.com' },
      update: {},
      create: {
        name: 'Tom Muller',
        email: 'tom@quoteiq.com',
        password: hash,
        role: Role.SALES_REP,
      },
    }),
  ]);

  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
