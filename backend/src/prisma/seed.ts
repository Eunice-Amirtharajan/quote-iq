import { PrismaClient, Role, QuotationStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding...');
  const seedPassword = process.env.SEED_PASSWORD ?? 'password123';
  const hash = await bcrypt.hash(seedPassword, 10);

  const [, anna, tom] = await Promise.all([
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

  // Create clients
  const bauer = await prisma.client.upsert({
    where: { id: 'c-bauer' },
    update: {},
    create: {
      id: 'c-bauer',
      name: 'Hans Bauer',
      company: 'Bauer Logistics GmbH',
      email: 'hans@bauer.de',
      city: 'Berlin',
      country: 'Germany',
      createdById: anna.id,
    },
  });

  const fischer = await prisma.client.upsert({
    where: { id: 'c-fischer' },
    update: {},
    create: {
      id: 'c-fischer',
      name: 'Emma Fischer',
      company: 'Fischer Tech Solutions',
      email: 'emma@fischertech.de',
      city: 'Munich',
      country: 'Germany',
      createdById: anna.id,
    },
  });

  // Quotations with meaningful patterns for AI analysis
  const quotations = [
    {
      id: 'q-1',
      num: 'QT-2026-0010',
      title: 'Enterprise Software Licensing',
      status: QuotationStatus.APPROVED,
      clientId: bauer.id,
      repId: anna.id,
      total: 14875,
    },
    {
      id: 'q-2',
      num: 'QT-2026-0011',
      title: 'Cloud Infrastructure Setup',
      status: QuotationStatus.SENT,
      clientId: fischer.id,
      repId: anna.id,
      total: 10412,
    },
    {
      id: 'q-3',
      num: 'QT-2026-0012',
      title: 'Security Audit',
      status: QuotationStatus.APPROVED,
      clientId: fischer.id,
      repId: anna.id,
      total: 11305,
    },
    {
      id: 'q-4',
      num: 'QT-2026-0013',
      title: 'Data Migration Large Scale',
      status: QuotationStatus.REJECTED,
      clientId: fischer.id,
      repId: anna.id,
      total: 21420,
    },
    {
      id: 'q-5',
      num: 'QT-2026-0014',
      title: 'Web App Development',
      status: QuotationStatus.SENT,
      clientId: bauer.id,
      repId: tom.id,
      total: 22000,
    },
    {
      id: 'q-6',
      num: 'QT-2026-0015',
      title: 'IT Consulting Retainer',
      status: QuotationStatus.REJECTED,
      clientId: fischer.id,
      repId: tom.id,
      total: 7200,
    },
    {
      id: 'q-7',
      num: 'QT-2026-0016',
      title: 'API Integration',
      status: QuotationStatus.APPROVED,
      clientId: bauer.id,
      repId: tom.id,
      total: 5800,
    },
    {
      id: 'q-8',
      num: 'QT-2026-0017',
      title: 'Mobile App MVP',
      status: QuotationStatus.REJECTED,
      clientId: fischer.id,
      repId: tom.id,
      total: 35000,
    },
  ];

  for (const q of quotations) {
    await prisma.quotation.upsert({
      where: { id: q.id },
      update: {},
      create: {
        id: q.id,
        quotationNumber: q.num,
        title: q.title,
        status: q.status,
        clientId: q.clientId,
        createdById: q.repId,
        subtotal: q.total,
        total: q.total,
        items: {
          create: [
            {
              description: 'Professional services',
              quantity: 1,
              unitPrice: q.total,
              lineTotal: q.total,
              sortOrder: 0,
            },
          ],
        },
      },
    });
  }

  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
