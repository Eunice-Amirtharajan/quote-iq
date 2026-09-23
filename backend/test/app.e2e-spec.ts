import { Test, TestingModule } from '@nestjs/testing';
import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/common/mail/mail.service';

class NoopThrottlerGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}

describe('QuoteIQ E2E', () => {
  let app: INestApplication;
  let authCookie: string;
  let managerCookie: string;
  let quotationId: string;
  let managerQuotationId: string;
  let deleteTargetId: string;
  let e2eClientId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(APP_GUARD)
      .useClass(NoopThrottlerGuard)
      .overrideProvider(MailService)
      .useValue({ sendMail: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    // Login as manager to create a shared test client
    const managerLoginRes = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation { login(email: "marcus@quoteiq.com", password: "password123") { id } }`,
      });
    managerCookie = (managerLoginRes.headers['set-cookie'] as unknown as string[])[0];

    // Login as rep
    const repLoginRes = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation { login(email: "anna@quoteiq.com", password: "password123") { id } }`,
      });
    authCookie = (repLoginRes.headers['set-cookie'] as unknown as string[])[0];

    // Create a reusable client for all e2e quotation tests
    const clientRes = await request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', managerCookie)
      .send({
        query: `mutation { createClient(name: "E2E Test Client") { id } }`,
      });
    e2eClientId = clientRes.body.data.createClient.id as string;
  }, 60_000);

  afterAll(async () => {
    // Clean up test data created during the run.
    // Each quotation must be deleted by its creator — ownership enforced at service layer.
    if (quotationId) {
      await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({ query: `mutation { deleteQuotation(id: "${quotationId}") }` });
    }
    // managerQuotationId is moved to SENT in the delete e2e test, so it cannot be deleted.
    // It is left in the DB — acceptable for a shared test environment.
    await app.close();
  });

  describe('Authentication', () => {
    it('login with valid credentials sets HttpOnly cookie', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              login(email: "anna@quoteiq.com", password: "password123") {
                id
                name
                email
                role
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.data.login).toMatchObject({
        email: 'anna@quoteiq.com',
        role: 'SALES_REP',
      });

      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      authCookie = cookies[0];
      expect(authCookie).toContain('access_token');
      expect(authCookie).toContain('HttpOnly');
    });

    it('login as manager', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              login(email: "marcus@quoteiq.com", password: "password123") {
                id email role
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.data.login.role).toBe('SALES_MANAGER');
      const cookies = response.headers['set-cookie'] as unknown as string[];
      managerCookie = cookies[0];
    });

    it('login with wrong password returns error', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              login(email: "anna@quoteiq.com", password: "wrongpassword") {
                id
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe('Invalid credentials');
    });

    it('login with unknown email returns error', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              login(email: "unknown@test.com", password: "password123") {
                id
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe('Invalid credentials');
    });

    it('me query returns authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            query {
              me {
                id email role
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.data.me).toMatchObject({
        email: 'anna@quoteiq.com',
        role: 'SALES_REP',
      });
    });

    it('me query fails without cookie', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `query { me { id email } }`,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });

    it('logout clears cookie', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `mutation { logout }`,
        })
        .expect(200);

      expect(response.body.data.logout).toBe(true);
    });
  });

  describe('Quotations', () => {
    it('creates a quotation with correct totals', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            mutation {
              createQuotation(input: {
                title:    "E2E Test Quotation"
                clientId: "${e2eClientId}"
                taxRate:  19
                items: [
                  { description: "Service A" quantity: 2 unitPrice: 1000 }
                  { description: "Service B" quantity: 1 unitPrice: 500  }
                ]
              }) {
                id
                quotationNumber
                title
                client { id name }
                status
                subtotal
                taxAmount
                total
                items { description quantity unitPrice lineTotal }
              }
            }
          `,
        })
        .expect(200);

      const q = response.body.data.createQuotation;
      expect(q.title).toBe('E2E Test Quotation');
      expect(q.client.name).toBe('E2E Test Client');
      expect(q.status).toBe('DRAFT');
      expect(q.subtotal).toBe(2500);
      expect(q.taxAmount).toBe(475);
      expect(q.total).toBe(2975);
      expect(q.quotationNumber).toMatch(/^QT-\d{4}-\d{4}$/);
      expect(q.items).toHaveLength(2);

      quotationId = q.id as string;
    });

    it('creates a DRAFT quotation for the delete test', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            mutation {
              createQuotation(input: {
                title:    "To Delete"
                clientId: "${e2eClientId}"
                taxRate:  0
                items: [{ description: "X" quantity: 1 unitPrice: 100 }]
              }) { id }
            }
          `,
        })
        .expect(200);

      expect(res.body.errors).toBeUndefined();
      deleteTargetId = res.body.data.createQuotation.id as string;
    });

    it('manager creates a quotation Anna cannot access', async () => {
      const managerRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `
            mutation {
              createQuotation(input: {
                title:    "Manager Quotation"
                clientId: "${e2eClientId}"
                taxRate:  0
                items: [{ description: "Item" quantity: 1 unitPrice: 100 }]
              }) { id }
            }
          `,
        })
        .expect(200);
      managerQuotationId = managerRes.body.data.createQuotation.id as string;
    });

    it('lists quotations for authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            query {
              quotations {
                id title status total
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.data.quotations).toBeInstanceOf(Array);
      expect(response.body.data.quotations.length).toBeGreaterThan(0);
    });

    it('filters quotations by status', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            query {
              quotations(filter: { status: DRAFT }) {
                id title status
              }
            }
          `,
        })
        .expect(200);

      const quotations = response.body.data.quotations;
      expect(quotations).toBeInstanceOf(Array);
      expect(
        quotations.every((q: { status: string }) => q.status === 'DRAFT'),
      ).toBe(true);
    });

    it('filters quotations by search term matching title', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            query {
              quotations(filter: { search: "E2E Test" }) {
                id title status
              }
            }
          `,
        })
        .expect(200);

      const quotations = response.body.data.quotations;
      expect(quotations).toBeInstanceOf(Array);
      expect(
        quotations.some((q: { title: string }) => q.title.includes('E2E Test')),
      ).toBe(true);
    });

    it('filter returns empty array when no match', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            query {
              quotations(filter: { search: "zzz_no_match_xyz" }) {
                id title
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.data.quotations).toEqual([]);
    });

    it('fetches a single quotation by id', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            query {
              quotation(id: "${quotationId}") {
                id title client { name } status subtotal taxAmount total
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.data.quotation).toMatchObject({
        id: quotationId,
        title: 'E2E Test Quotation',
        client: { name: 'E2E Test Client' },
        subtotal: 2500,
        total: 2975,
      });
    });

    it('updates quotation status from DRAFT to SENT', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            mutation {
              updateQuotationStatus(
                id: "${quotationId}"
                input: { status: SENT note: "Sent to client" }
              ) {
                id status
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.data.updateQuotationStatus.status).toBe('SENT');
    });

    it('rejects quotation creation without auth', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              createQuotation(input: {
                title: "Test" clientId: "00000000-0000-0000-0000-000000000000" items: []
              }) { id }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Quotations — role enforcement', () => {
    it('manager can approve a SENT quotation', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `
            mutation {
              updateQuotationStatus(
                id: "${quotationId}"
                input: { status: APPROVED note: "Looks good" }
              ) {
                id status
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.data.updateQuotationStatus.status).toBe('APPROVED');
    });

    it('rejects illegal status transition', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `
            mutation {
              updateQuotationStatus(
                id: "${quotationId}"
                input: { status: SENT }
              ) {
                id status
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toMatch(/cannot transition/i);
    });

    it('SALES_REP cannot access a quotation created by another user', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            query {
              quotation(id: "${managerQuotationId}") {
                id
              }
            }
          `,
        })
        .expect(200);

      const result = response.body.data?.quotation;
      const hasError = response.body.errors?.length > 0;
      expect(result === null || hasError).toBe(true);
    });

    it('creator can delete their own DRAFT quotation', async () => {
      const deleteRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({ query: `mutation { deleteQuotation(id: "${deleteTargetId}") }` })
        .expect(200);

      expect(deleteRes.body.errors).toBeUndefined();
      expect(deleteRes.body.data.deleteQuotation).toBe(true);
    });

    it("non-creator (manager) cannot delete another user's DRAFT", async () => {
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            mutation {
              createQuotation(input: {
                title:    "Rep Draft For Ownership Test"
                clientId: "${e2eClientId}"
                taxRate:  0
                items: [{ description: "X" quantity: 1 unitPrice: 50 }]
              }) { id }
            }
          `,
        })
        .expect(200);
      const repDraftId = createRes.body.data.createQuotation.id as string;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `mutation { deleteQuotation(id: "${repDraftId}") }`,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('own quotations');

      // Clean up the draft (rep deletes their own)
      await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({ query: `mutation { deleteQuotation(id: "${repDraftId}") }` });
    });

    it('rejects deletion of a non-DRAFT quotation', async () => {
      // Submit the manager's quotation to SENT so it is no longer DRAFT
      await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `
            mutation {
              updateQuotationStatus(id: "${managerQuotationId}", input: { status: SENT }) { id status }
            }
          `,
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `mutation { deleteQuotation(id: "${managerQuotationId}") }`,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('DRAFT');
    });
  });

  describe('salesReps query', () => {
    it('returns list of sales reps for manager', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `
            query {
              salesReps {
                id name
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const reps = response.body.data.salesReps as { id: string; name: string }[];
      expect(Array.isArray(reps)).toBe(true);
      expect(reps.length).toBeGreaterThan(0);
      expect(reps[0]).toHaveProperty('id');
      expect(reps[0]).toHaveProperty('name');
    });

    it('rejects salesReps query for SALES_REP', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `query { salesReps { id name } }`,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Quotations — repId filter', () => {
    it('manager can filter quotations by repId', async () => {
      // Fetch the rep's id from salesReps, then filter by it
      const repsRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({ query: `query { salesReps { id name } }` })
        .expect(200);

      const reps = repsRes.body.data.salesReps as { id: string; name: string }[];
      const repId = reps[0].id;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `
            query {
              quotations(filter: { repId: "${repId}" }) {
                id
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(Array.isArray(response.body.data.quotations)).toBe(true);
    });
  });

  describe('conversionScore query', () => {
    it('manager can fetch conversion score for a SENT quotation', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `
            query {
              conversionScore(quotationId: "${quotationId}") {
                score
                label
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const score = response.body.data.conversionScore;
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(score.label);
    });

    it('SALES_REP cannot access conversionScore', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            query {
              conversionScore(quotationId: "${quotationId}") {
                score label
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('updateQuotation mutation', () => {
    it('rep can edit their own DRAFT quotation', async () => {
      // quotationId is APPROVED by this point — create a fresh DRAFT for this test
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            mutation {
              createQuotation(input: {
                title:    "Edit Test Draft"
                clientId: "${e2eClientId}"
                taxRate:  0
                items: [{ description: "Item" quantity: 1 unitPrice: 100 }]
              }) { id }
            }
          `,
        })
        .expect(200);
      const editDraftId = createRes.body.data.createQuotation.id as string;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            mutation {
              updateQuotation(
                id: "${editDraftId}",
                input: { title: "Updated Title", version: 1 }
              ) {
                id
                title
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.updateQuotation.title).toBe('Updated Title');

      // Clean up
      await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({ query: `mutation { deleteQuotation(id: "${editDraftId}") }` });
    });

    it('unauthenticated user cannot update a quotation', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              updateQuotation(id: "${quotationId}", input: { title: "Hack", version: 1 }) {
                id
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('statusHistory query', () => {
    it('rep can fetch status history for own quotation', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            query {
              statusHistory(quotationId: "${quotationId}") {
                id
                fromStatus
                toStatus
                changedAt
                changedBy { name }
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const history = response.body.data.statusHistory as {
        id: string;
        fromStatus: string;
        toStatus: string;
      }[];
      expect(Array.isArray(history)).toBe(true);
    });

    it('manager can fetch status history for any quotation', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `
            query {
              statusHistory(quotationId: "${quotationId}") {
                id fromStatus toStatus changedAt
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
    });

    it('unauthenticated user cannot fetch status history', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `query { statusHistory(quotationId: "${quotationId}") { id } }`,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });

    it('creating a quotation writes a DRAFT→DRAFT history entry', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            mutation {
              createQuotation(input: {
                title:    "History Seed Test"
                clientId: "${e2eClientId}"
                taxRate:  0
                items: [{ description: "Item", quantity: 1, unitPrice: 100 }]
              }) { id }
            }
          `,
        })
        .expect(200);

      expect(createResponse.body.errors).toBeUndefined();
      const newId = createResponse.body.data.createQuotation.id as string;

      const historyResponse = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            query {
              statusHistory(quotationId: "${newId}") {
                fromStatus toStatus note
              }
            }
          `,
        })
        .expect(200);

      expect(historyResponse.body.errors).toBeUndefined();
      const history = historyResponse.body.data.statusHistory as {
        fromStatus: string;
        toStatus: string;
        note: string | null;
      }[];
      expect(history).toHaveLength(1);
      expect(history[0].fromStatus).toBe('DRAFT');
      expect(history[0].toStatus).toBe('DRAFT');
      expect(history[0].note).toBeNull();
    });

    it('editing a quotation writes a DRAFT→DRAFT history entry with changed fields in note', async () => {
      // Create a fresh DRAFT — quotationId is APPROVED by this point
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            mutation {
              createQuotation(input: {
                title:    "History Edit Test"
                clientId: "${e2eClientId}"
                taxRate:  0
                items: [{ description: "Item" quantity: 1 unitPrice: 50 }]
              }) { id }
            }
          `,
        })
        .expect(200);
      const freshId = createRes.body.data.createQuotation.id as string;

      const updateResponse = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            mutation {
              updateQuotation(
                id: "${freshId}",
                input: { title: "Edited Title", clientId: "${e2eClientId}", version: 1 }
              ) { id }
            }
          `,
        })
        .expect(200);

      expect(updateResponse.body.errors).toBeUndefined();

      const historyResponse = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            query {
              statusHistory(quotationId: "${freshId}") {
                fromStatus toStatus note
              }
            }
          `,
        })
        .expect(200);

      expect(historyResponse.body.errors).toBeUndefined();
      const history = historyResponse.body.data.statusHistory as {
        fromStatus: string;
        toStatus: string;
        note: string | null;
      }[];
      const editEntry = history.find(
        (h) => h.fromStatus === 'DRAFT' && h.toStatus === 'DRAFT' && h.note !== null,
      );
      expect(editEntry).toBeDefined();
      expect(editEntry!.note).toContain('title');
      expect(editEntry!.note).toContain('client');

      // Clean up
      await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({ query: `mutation { deleteQuotation(id: "${freshId}") }` });
    });
  });

  describe('Dashboard', () => {
    it('returns stats for manager', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `
            query {
              dashboardStats {
                totalQuotations
                totalSent
                totalApproved
                totalRejected
                conversionRate
                totalPipelineValue
                totalApprovedValue
              }
            }
          `,
        })
        .expect(200);

      const stats = response.body.data.dashboardStats;
      expect(stats.totalQuotations).toBeGreaterThan(0);
      expect(stats.conversionRate).toBeGreaterThanOrEqual(0);
    });

    it('rejects dashboard access for unauthenticated user', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `query { dashboardStats { totalQuotations } }`,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });

    it('rejects dashboard access for SALES_REP', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `query { dashboardStats { totalQuotations } }`,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('winLossAnalysis query', () => {
    it('returns stats for SALES_MANAGER', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `
            query {
              winLossAnalysis {
                approvalRate
                avgApprovedDeal
                avgRejectedDeal
                byRep {
                  repName
                  sent
                  approved
                  rejected
                  approvalRate
                }
                byDealSize {
                  bucket
                  total
                  approved
                  approvalRate
                }
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const stats = response.body.data.winLossAnalysis;
      expect(stats).toBeDefined();
      expect(typeof stats.approvalRate).toBe('number');
      expect(Array.isArray(stats.byRep)).toBe(true);
      expect(Array.isArray(stats.byDealSize)).toBe(true);
    });

    it('blocks SALES_REP from accessing win/loss analysis', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `query { winLossAnalysis { approvalRate } }`,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });

    it('blocks unauthenticated request', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `query { winLossAnalysis { approvalRate } }`,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('askAboutQuotation mutation', () => {
    // Full Groq integration is not verified in e2e — requires a live API key
    // which is not available in the test environment. Auth + routing are covered
    // by the two tests below; AI output quality is covered in ai.service.spec.ts.
    it('mutation is reachable by manager (Groq may error in test env)', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `
            mutation {
              askAboutQuotation(
                quotationId: "${managerQuotationId}"
                question: "What is the total value of this quotation?"
              ) {
                answer
              }
            }
          `,
        })
        .expect(200);

      // Guard passed — manager reached the resolver. Groq may fail in test env.
      const isAuthError = response.body.errors?.some(
        (e: { message: string }) =>
          e.message.includes('Forbidden') || e.message.includes('Unauthorized'),
      );
      expect(isAuthError).toBeFalsy();
    });

    it('blocks SALES_REP from asking questions', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            mutation {
              askAboutQuotation(
                quotationId: "${quotationId}"
                question: "What is the total?"
              ) {
                answer
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });

    it('blocks unauthenticated request', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              askAboutQuotation(
                quotationId: "any-id"
                question: "What is the total?"
              ) {
                answer
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });
  });
});
