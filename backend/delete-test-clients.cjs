// One-off: remove e2e test clients (and 3 hand-entered test clients) plus their quotes from the dev DB.
// Run from backend/:  node delete-test-clients.cjs   — then delete this file.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const E2E_NAME = /^(NewClient|DetailClient|TestClient|MobileClient)-\d+$/;
const MANUAL = ['test client', 'sdsd', '2323'];

(async () => {
  const where = {
    OR: [
      ...['NewClient-', 'DetailClient-', 'TestClient-', 'MobileClient-'].map((s) => ({ name: { startsWith: s } })),
      { name: { in: MANUAL } },
    ],
  };
  const res = await p.$transaction(
    async (tx) => {
      const clients = await tx.client.findMany({ where, select: { id: true, name: true } });
      const unexpected = clients.filter((c) => !E2E_NAME.test(c.name) && !MANUAL.includes(c.name));
      if (clients.length !== 55 || unexpected.length) {
        throw new Error(`Expected 55 clients, matched ${clients.length}: ${unexpected.map((c) => c.name).join(', ')}`);
      }
      const ids = clients.map((c) => c.id);
      const quotes = await tx.quotation.deleteMany({ where: { clientId: { in: ids } } });
      if (quotes.count !== 43) throw new Error(`Expected 43 quotes, got ${quotes.count} — rolled back`);
      const deleted = await tx.client.deleteMany({ where: { id: { in: ids } } });
      // Win/Loss caches its aggregate in the DB — drop it so the page recomputes
      await tx.aIInsight.deleteMany({ where: { type: 'WIN_LOSS_ANALYSIS' } });
      return { quotes: quotes.count, clients: deleted.count };
    },
    { timeout: 60_000 },
  );
  console.log('Deleted', res, '— clients remaining:', await p.client.count());
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
