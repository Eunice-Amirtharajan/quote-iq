import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';

describe('QuoteIQ E2E', () => {
  let app: INestApplication;
  let authCookie: string;
  let managerCookie: string;
  let clientId: string;
  let quotationId: string;
  let managerQuotationId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
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

      // Cookie should be set
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

  describe('Clients', () => {
    it('creates a new client', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            mutation {
              createClient(input: {
                name:    "Test Client"
                company: "Test GmbH"
                email:   "test@client.de"
                city:    "Berlin"
                country: "Germany"
              }) {
                id name company email city country
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.data.createClient).toMatchObject({
        name: 'Test Client',
        company: 'Test GmbH',
        email: 'test@client.de',
      });

      clientId = response.body.data.createClient.id;
    });

    it('lists clients for authenticated rep', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            query {
              clients {
                id name company
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.data.clients).toBeInstanceOf(Array);
      expect(response.body.data.clients.length).toBeGreaterThan(0);
    });

    it('rejects client creation without auth', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation {
              createClient(input: {
                name: "Test" company: "Test" email: "test@test.de"
              }) { id }
            }
          `,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
    });

    it('updates a client', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            mutation {
              updateClient(
                id: "${clientId}"
                input: {
                  name:    "Updated Client"
                  company: "Updated GmbH"
                  email:   "updated@client.de"
                }
              ) {
                id name company
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.data.updateClient).toMatchObject({
        name: 'Updated Client',
        company: 'Updated GmbH',
      });
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
                clientId: "${clientId}"
                taxRate:  19
                items: [
                  { description: "Service A" quantity: 2 unitPrice: 1000 }
                  { description: "Service B" quantity: 1 unitPrice: 500  }
                ]
              }) {
                id
                quotationNumber
                title
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
      expect(q.status).toBe('DRAFT');
      expect(q.subtotal).toBe(2500); // 2*1000 + 1*500
      expect(q.taxAmount).toBe(475); // 2500 * 19%
      expect(q.total).toBe(2975); // 2500 + 475
      expect(q.quotationNumber).toMatch(/^QT-\d{4}-\d{4}$/);
      expect(q.items).toHaveLength(2);

      quotationId = q.id;
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
                clientId: "${clientId}"
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

    it('fetches a single quotation by id', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `
            query {
              quotation(id: "${quotationId}") {
                id title status subtotal taxAmount total
              }
            }
          `,
        })
        .expect(200);

      expect(response.body.data.quotation).toMatchObject({
        id: quotationId,
        title: 'E2E Test Quotation',
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
                title: "Test" clientId: "${clientId}" items: []
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

    it('SALES_MANAGER can delete a quotation', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `
            mutation {
              createQuotation(input: {
                title: "To Delete"
                clientId: "${clientId}"
                taxRate: 0
                items: [{ description: "X" quantity: 1 unitPrice: 100 }]
              }) { id }
            }
          `,
        })
        .expect(200);

      const toDeleteId = createRes.body.data.createQuotation.id as string;

      const deleteRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', managerCookie)
        .send({
          query: `mutation { deleteQuotation(id: "${toDeleteId}") }`,
        })
        .expect(200);

      expect(deleteRes.body.data.deleteQuotation).toBe(true);
    });

    it('SALES_REP cannot delete a quotation', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', authCookie)
        .send({
          query: `mutation { deleteQuotation(id: "${quotationId}") }`,
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
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
});
