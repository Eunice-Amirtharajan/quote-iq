import { PrismaClient, Role, QuotationStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function calcTotals(
  items: { description: string; quantity: number; unitPrice: number }[],
  taxRate: number,
) {
  const itemsWithTotal = items.map((i) => ({
    ...i,
    lineTotal: Math.round(i.quantity * i.unitPrice * 100) / 100,
  }));
  const subtotal =
    Math.round(itemsWithTotal.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { itemsWithTotal, subtotal, taxAmount, total };
}

async function main() {
  console.log('Seeding...');
  const seedPassword = process.env.SEED_PASSWORD ?? 'password123';
  const hash = await bcrypt.hash(seedPassword, 10);

  const [marcus, anna, tom] = await Promise.all([
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

  // 4 clients — 2 per rep; upsert on email (@@unique) for idempotency
  const [bauer, vogel, fischer, richter] = await Promise.all([
    prisma.client.upsert({
      where: { email: 'hans@bauer-logistics.de' },
      update: {},
      create: {
        name: 'Hans Bauer',
        company: 'Bauer Logistics GmbH',
        email: 'hans@bauer-logistics.de',
        city: 'Berlin',
        country: 'Germany',
        createdById: anna.id,
      },
    }),
    prisma.client.upsert({
      where: { email: 'lena@vogeldigital.de' },
      update: {},
      create: {
        name: 'Lena Vogel',
        company: 'Vogel Digital AG',
        email: 'lena@vogeldigital.de',
        city: 'Hamburg',
        country: 'Germany',
        createdById: anna.id,
      },
    }),
    prisma.client.upsert({
      where: { email: 'emma@fischertech.de' },
      update: {},
      create: {
        name: 'Emma Fischer',
        company: 'Fischer Tech Solutions',
        email: 'emma@fischertech.de',
        city: 'Munich',
        country: 'Germany',
        createdById: tom.id,
      },
    }),
    prisma.client.upsert({
      where: { email: 'k.richter@richter-mfg.de' },
      update: {},
      create: {
        name: 'Klaus Richter',
        company: 'Richter Manufacturing',
        email: 'k.richter@richter-mfg.de',
        city: 'Stuttgart',
        country: 'Germany',
        createdById: tom.id,
      },
    }),
  ]);

  type QuotationDef = {
    num: string;
    title: string;
    status: QuotationStatus;
    clientId: string;
    repId: string;
    taxRate: number;
    notes?: string;
    items: { description: string; quantity: number; unitPrice: number }[];
  };

  const quotationDefs: QuotationDef[] = [
    // ── Bauer Logistics (Anna) — reliable client, mostly approved ──────────
    {
      num: 'QT-2026-0010',
      title: 'Enterprise Software Licensing',
      status: QuotationStatus.APPROVED,
      clientId: bauer.id,
      repId: anna.id,
      taxRate: 19,
      notes: 'Annual renewal. Client confirmed budget in Q1 planning.',
      items: [
        {
          description: 'ERP Core License (per seat ×50)',
          quantity: 50,
          unitPrice: 180,
        },
        {
          description: 'Implementation & Onboarding',
          quantity: 1,
          unitPrice: 2500,
        },
      ],
    },
    {
      num: 'QT-2026-0011',
      title: 'Network Infrastructure Upgrade',
      status: QuotationStatus.APPROVED,
      clientId: bauer.id,
      repId: anna.id,
      taxRate: 19,
      notes: 'Replacing end-of-life switches across 3 warehouse locations.',
      items: [
        {
          description: 'Managed Switch 48-port (×6)',
          quantity: 6,
          unitPrice: 1200,
        },
        {
          description: 'Structured Cabling & Installation',
          quantity: 1,
          unitPrice: 3800,
        },
        {
          description: 'Project Management (days ×3)',
          quantity: 3,
          unitPrice: 950,
        },
      ],
    },
    {
      num: 'QT-2026-0012',
      title: 'Cybersecurity Assessment',
      status: QuotationStatus.SENT,
      clientId: bauer.id,
      repId: anna.id,
      taxRate: 19,
      notes: 'Triggered by new NIS2 compliance requirement.',
      items: [
        {
          description: 'Penetration Testing (external)',
          quantity: 1,
          unitPrice: 4200,
        },
        {
          description: 'Vulnerability Report & Remediation Plan',
          quantity: 1,
          unitPrice: 1800,
        },
      ],
    },
    {
      num: 'QT-2026-0013',
      title: 'Data Warehouse Implementation',
      status: QuotationStatus.DRAFT,
      clientId: bauer.id,
      repId: anna.id,
      taxRate: 19,
      notes: 'Discovery phase completed. Scoping still in progress.',
      items: [
        {
          description: 'Data Modelling & Architecture (days ×10)',
          quantity: 10,
          unitPrice: 1100,
        },
        {
          description: 'ETL Pipeline Development',
          quantity: 1,
          unitPrice: 8500,
        },
        {
          description: 'Training Workshop (half-day ×2)',
          quantity: 2,
          unitPrice: 1200,
        },
      ],
    },

    // ── Vogel Digital (Anna) — price-sensitive, mixed results ──────────────
    {
      num: 'QT-2026-0014',
      title: 'Cloud Migration Strategy',
      status: QuotationStatus.APPROVED,
      clientId: vogel.id,
      repId: anna.id,
      taxRate: 19,
      notes: 'Phased migration to AWS. Phase 1 only — dev & staging envs.',
      items: [
        {
          description: 'Cloud Architecture Design',
          quantity: 1,
          unitPrice: 3500,
        },
        {
          description: 'Infrastructure as Code (Terraform)',
          quantity: 1,
          unitPrice: 4200,
        },
        { description: 'CI/CD Pipeline Setup', quantity: 1, unitPrice: 2800 },
      ],
    },
    {
      num: 'QT-2026-0015',
      title: 'Full Cloud Migration (All Environments)',
      status: QuotationStatus.REJECTED,
      clientId: vogel.id,
      repId: anna.id,
      taxRate: 19,
      notes:
        'Client felt full migration scope was too large for this budget cycle.',
      items: [
        {
          description: 'Cloud Architecture Design',
          quantity: 1,
          unitPrice: 3500,
        },
        {
          description: 'Migration Execution (days ×20)',
          quantity: 20,
          unitPrice: 1100,
        },
        {
          description: 'Data Transfer & Validation',
          quantity: 1,
          unitPrice: 5500,
        },
        {
          description: 'Post-migration Support (months ×3)',
          quantity: 3,
          unitPrice: 1800,
        },
      ],
    },
    {
      num: 'QT-2026-0016',
      title: 'DevOps Toolchain Setup',
      status: QuotationStatus.REJECTED,
      clientId: vogel.id,
      repId: anna.id,
      taxRate: 19,
      notes: 'Lost to a competitor offering a lower day rate.',
      items: [
        {
          description: 'CI/CD Configuration (Jenkins + GitHub Actions)',
          quantity: 1,
          unitPrice: 3200,
        },
        {
          description: 'Container Orchestration (Kubernetes)',
          quantity: 1,
          unitPrice: 4800,
        },
        {
          description: 'Monitoring Stack (Grafana + Prometheus)',
          quantity: 1,
          unitPrice: 2600,
        },
      ],
    },
    {
      num: 'QT-2026-0017',
      title: 'API Gateway & Developer Portal',
      status: QuotationStatus.SENT,
      clientId: vogel.id,
      repId: anna.id,
      taxRate: 19,
      notes:
        'Follows up on the cloud migration. Good fit — client already using our stack.',
      items: [
        {
          description: 'API Gateway Configuration',
          quantity: 1,
          unitPrice: 2400,
        },
        {
          description: 'Developer Portal (Docusaurus)',
          quantity: 1,
          unitPrice: 3100,
        },
        {
          description: 'OAuth2 / OIDC Integration',
          quantity: 1,
          unitPrice: 1900,
        },
      ],
    },

    // ── Fischer Tech (Tom) — high approval rate, larger deals ──────────────
    {
      num: 'QT-2026-0018',
      title: 'Custom ERP Module Development',
      status: QuotationStatus.APPROVED,
      clientId: fischer.id,
      repId: tom.id,
      taxRate: 19,
      notes: 'Extending existing SAP instance with bespoke reporting module.',
      items: [
        {
          description: 'Requirements Analysis (days ×5)',
          quantity: 5,
          unitPrice: 1200,
        },
        {
          description: 'Backend Development (days ×15)',
          quantity: 15,
          unitPrice: 1100,
        },
        {
          description: 'Frontend Dashboard (days ×8)',
          quantity: 8,
          unitPrice: 1050,
        },
        { description: 'UAT & Deployment', quantity: 1, unitPrice: 2200 },
      ],
    },
    {
      num: 'QT-2026-0019',
      title: 'Mobile App — Field Service',
      status: QuotationStatus.APPROVED,
      clientId: fischer.id,
      repId: tom.id,
      taxRate: 19,
      notes: 'React Native app for field technicians. Offline-first.',
      items: [
        {
          description: 'UX Design & Prototyping',
          quantity: 1,
          unitPrice: 4500,
        },
        {
          description: 'React Native Development (days ×20)',
          quantity: 20,
          unitPrice: 1050,
        },
        { description: 'Backend API (NestJS)', quantity: 1, unitPrice: 6000 },
        {
          description: 'App Store Submission & QA',
          quantity: 1,
          unitPrice: 1500,
        },
      ],
    },
    {
      num: 'QT-2026-0020',
      title: 'Analytics Platform',
      status: QuotationStatus.SENT,
      clientId: fischer.id,
      repId: tom.id,
      taxRate: 19,
      notes: 'Real-time KPI dashboards. Client has existing data in BigQuery.',
      items: [
        {
          description: 'Data Pipeline (BigQuery → dbt)',
          quantity: 1,
          unitPrice: 5500,
        },
        {
          description: 'Dashboard Development (Metabase)',
          quantity: 1,
          unitPrice: 3200,
        },
        { description: 'Training & Handover', quantity: 1, unitPrice: 1500 },
      ],
    },
    {
      num: 'QT-2026-0021',
      title: 'Legacy System Replatforming',
      status: QuotationStatus.REJECTED,
      clientId: fischer.id,
      repId: tom.id,
      taxRate: 19,
      notes: 'Client approved Phase 1 budget but full scope was above ceiling.',
      items: [
        {
          description: 'Architecture Assessment',
          quantity: 1,
          unitPrice: 4000,
        },
        {
          description: 'Backend Rewrite (Java → NestJS) days ×30',
          quantity: 30,
          unitPrice: 1100,
        },
        {
          description: 'Data Migration & Cutover',
          quantity: 1,
          unitPrice: 8000,
        },
        {
          description: 'Parallel Run Support (months ×2)',
          quantity: 2,
          unitPrice: 3500,
        },
      ],
    },

    // ── Richter Manufacturing (Tom) — budget constrained, frequent rejection ─
    {
      num: 'QT-2026-0022',
      title: 'IoT Sensor Integration',
      status: QuotationStatus.APPROVED,
      clientId: richter.id,
      repId: tom.id,
      taxRate: 19,
      notes: 'Pilot project — 20 sensors on production line.',
      items: [
        { description: 'IoT Hub Setup (Azure)', quantity: 1, unitPrice: 2800 },
        {
          description: 'Sensor Firmware Configuration (×20)',
          quantity: 20,
          unitPrice: 120,
        },
        { description: 'Dashboard & Alerting', quantity: 1, unitPrice: 2200 },
      ],
    },
    {
      num: 'QT-2026-0023',
      title: 'Full IoT Rollout — All Lines',
      status: QuotationStatus.REJECTED,
      clientId: richter.id,
      repId: tom.id,
      taxRate: 19,
      notes:
        'Scaled-up version of pilot. Rejected — client wants to extend pilot first.',
      items: [
        { description: 'IoT Hub Scaling', quantity: 1, unitPrice: 4500 },
        {
          description: 'Sensor Firmware Configuration (×120)',
          quantity: 120,
          unitPrice: 110,
        },
        {
          description: 'Predictive Maintenance Model',
          quantity: 1,
          unitPrice: 9000,
        },
        { description: 'Integration with ERP', quantity: 1, unitPrice: 5500 },
      ],
    },
    {
      num: 'QT-2026-0024',
      title: 'ERP Integration — Production Module',
      status: QuotationStatus.REJECTED,
      clientId: richter.id,
      repId: tom.id,
      taxRate: 19,
      notes:
        'Third proposal for this client — budget approval delayed to next FY.',
      items: [
        {
          description: 'SAP Production Planning Integration',
          quantity: 1,
          unitPrice: 7200,
        },
        { description: 'Custom API Development', quantity: 1, unitPrice: 4800 },
        {
          description: 'Testing & Go-live Support',
          quantity: 1,
          unitPrice: 2500,
        },
      ],
    },
    {
      num: 'QT-2026-0025',
      title: 'IT Support Retainer',
      status: QuotationStatus.SENT,
      clientId: richter.id,
      repId: tom.id,
      taxRate: 19,
      notes:
        'Smaller scope — trying to land something while ERP budget is frozen.',
      items: [
        {
          description: 'Monthly IT Support (8h SLA)',
          quantity: 6,
          unitPrice: 1200,
        },
        {
          description: 'On-call Emergency Support',
          quantity: 6,
          unitPrice: 400,
        },
      ],
    },
    {
      num: 'QT-2026-0026',
      title: 'Quality Management System',
      status: QuotationStatus.DRAFT,
      clientId: richter.id,
      repId: tom.id,
      taxRate: 19,
      notes: 'New requirement from ISO 9001 audit. Early-stage scoping.',
      items: [
        {
          description: 'QMS Software Licensing (annual)',
          quantity: 1,
          unitPrice: 3600,
        },
        {
          description: 'Implementation & Configuration',
          quantity: 1,
          unitPrice: 4200,
        },
        {
          description: 'Staff Training (days ×2)',
          quantity: 2,
          unitPrice: 950,
        },
      ],
    },

    // ── Two more for Anna — Vogel DRAFT and Bauer APPROVED ─────────────────
    {
      num: 'QT-2026-0027',
      title: 'E-commerce Platform Rebuild',
      status: QuotationStatus.APPROVED,
      clientId: bauer.id,
      repId: anna.id,
      taxRate: 19,
      notes: 'Migrating from Magento to Next.js + headless CMS.',
      items: [
        { description: 'Discovery & UX Audit', quantity: 1, unitPrice: 2800 },
        {
          description: 'Frontend Development (days ×18)',
          quantity: 18,
          unitPrice: 1000,
        },
        { description: 'Backend / API Layer', quantity: 1, unitPrice: 5500 },
        {
          description: 'Data Migration & SEO Redirect Setup',
          quantity: 1,
          unitPrice: 2200,
        },
      ],
    },
    {
      num: 'QT-2026-0028',
      title: 'AI-Powered Search Integration',
      status: QuotationStatus.SENT,
      clientId: vogel.id,
      repId: anna.id,
      taxRate: 19,
      notes:
        'Semantic search using OpenAI embeddings + Elastic. Strong interest from CTO.',
      items: [
        {
          description: 'Embedding Pipeline (OpenAI + Elastic)',
          quantity: 1,
          unitPrice: 4800,
        },
        {
          description: 'Search UI Component Library',
          quantity: 1,
          unitPrice: 3200,
        },
        { description: 'A/B Testing Setup', quantity: 1, unitPrice: 1600 },
      ],
    },
    {
      num: 'QT-2026-0029',
      title: 'Compliance Reporting Automation',
      status: QuotationStatus.DRAFT,
      clientId: vogel.id,
      repId: anna.id,
      taxRate: 7,
      notes:
        'GDPR + DSGVO reporting. Reduced VAT applies — consulting service.',
      items: [
        {
          description: 'Compliance Workflow Design',
          quantity: 1,
          unitPrice: 2200,
        },
        {
          description: 'Report Generation Engine',
          quantity: 1,
          unitPrice: 3800,
        },
        {
          description: 'Audit Trail & Export Module',
          quantity: 1,
          unitPrice: 1900,
        },
      ],
    },
  ];

  for (const q of quotationDefs) {
    const { itemsWithTotal, subtotal, taxAmount, total } = calcTotals(
      q.items,
      q.taxRate,
    );

    await prisma.quotation.upsert({
      where: { quotationNumber: q.num },
      update: {},
      create: {
        quotationNumber: q.num,
        title: q.title,
        status: q.status,
        clientId: q.clientId,
        createdById: q.repId,
        notes: q.notes,
        taxRate: q.taxRate,
        subtotal,
        taxAmount,
        total,
        items: {
          create: itemsWithTotal.map((item, i) => ({ ...item, sortOrder: i })),
        },
      },
    });

    // Status history for non-DRAFT quotes
    if (q.status !== QuotationStatus.DRAFT) {
      const quotation = await prisma.quotation.findUnique({
        where: { quotationNumber: q.num },
        select: { id: true },
      });

      if (quotation) {
        const qid = quotation.id;
        const existingHistory = await prisma.statusHistory.findFirst({
          where: { quotationId: qid, toStatus: QuotationStatus.SENT },
        });

        if (!existingHistory) {
          await prisma.statusHistory.create({
            data: {
              quotationId: qid,
              fromStatus: QuotationStatus.DRAFT,
              toStatus: QuotationStatus.SENT,
              note: 'Sent to client',
              changedById: q.repId,
            },
          });
        }

        if (
          q.status === QuotationStatus.APPROVED ||
          q.status === QuotationStatus.REJECTED
        ) {
          const existingFinal = await prisma.statusHistory.findFirst({
            where: { quotationId: qid, toStatus: q.status },
          });

          if (!existingFinal) {
            await prisma.statusHistory.create({
              data: {
                quotationId: qid,
                fromStatus: QuotationStatus.SENT,
                toStatus: q.status,
                note:
                  q.status === QuotationStatus.APPROVED
                    ? 'Approved by manager'
                    : 'Rejected by manager',
                changedById: marcus.id,
              },
            });
          }
        }
      }
    }
  }

  console.log('Seed complete — 4 clients, 20 quotations with realistic data');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
