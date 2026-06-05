import { readFileSync } from 'fs';
import { join } from 'path';

const schema = readFileSync(join(__dirname, 'schema.gql'), 'utf-8');

describe('GraphQL schema contract', () => {
  describe('Query.quotations', () => {
    it('exposes nullable skip and take args', () => {
      expect(schema).toContain('quotations(skip: Int, take: Int)');
    });
  });

  describe('Query.clients', () => {
    it('exposes nullable skip and take args', () => {
      expect(schema).toContain('clients(skip: Int, take: Int)');
    });
  });

  describe('Query.quotation', () => {
    it('accepts an ID arg and is nullable', () => {
      expect(schema).toContain('quotation(id: ID!): QuotationType');
    });
  });

  describe('Query.client', () => {
    it('accepts an ID arg and is nullable', () => {
      expect(schema).toContain('client(id: ID!): ClientType');
    });
  });

  describe('Query.dashboardStats', () => {
    it('is non-nullable', () => {
      expect(schema).toContain('dashboardStats: DashboardStatsType!');
    });
  });

  describe('Mutation.updateQuotationStatus', () => {
    it('accepts id and input args', () => {
      expect(schema).toContain(
        'updateQuotationStatus(id: ID!, input: UpdateQuotationStatusInput!)',
      );
    });
  });

  describe('Mutation.deleteQuotation', () => {
    it('is restricted to ID arg and returns Boolean', () => {
      expect(schema).toContain('deleteQuotation(id: ID!): Boolean!');
    });
  });

  describe('Mutation.deleteClient', () => {
    it('is restricted to ID arg and returns Boolean', () => {
      expect(schema).toContain('deleteClient(id: ID!): Boolean!');
    });
  });

  describe('QuotationType', () => {
    it('does not expose createdById or clientId FK scalars', () => {
      const quotationTypeBlock = schema.slice(
        schema.indexOf('type QuotationType'),
        schema.indexOf('}', schema.indexOf('type QuotationType')),
      );
      expect(quotationTypeBlock).not.toContain('createdById');
      expect(quotationTypeBlock).not.toContain('clientId');
    });

    it('items field is non-nullable list of non-nullable items', () => {
      expect(schema).toContain('items: [QuotationItemType!]!');
    });
  });

  describe('QuotationItemType', () => {
    it('does not expose quotationId FK scalar', () => {
      const itemTypeBlock = schema.slice(
        schema.indexOf('type QuotationItemType'),
        schema.indexOf('}', schema.indexOf('type QuotationItemType')),
      );
      expect(itemTypeBlock).not.toContain('quotationId');
    });
  });

  describe('ClientType', () => {
    it('does not expose createdById FK scalar', () => {
      const clientTypeBlock = schema.slice(
        schema.indexOf('type ClientType'),
        schema.indexOf('}', schema.indexOf('type ClientType')),
      );
      expect(clientTypeBlock).not.toContain('createdById');
    });
  });

  describe('Mutation.quotationSummary', () => {
    it('is a mutation not a query', () => {
      const mutationBlock = schema.slice(
        schema.indexOf('type Mutation'),
        schema.indexOf('}', schema.indexOf('type Mutation')),
      );
      expect(mutationBlock).toContain('quotationSummary');
      expect(schema.slice(
        schema.indexOf('type Query'),
        schema.indexOf('}', schema.indexOf('type Query')),
      )).not.toContain('quotationSummary');
    });
  });

  describe('UserType', () => {
    it('does not expose password field', () => {
      const userTypeBlock = schema.slice(
        schema.indexOf('type UserType'),
        schema.indexOf('}', schema.indexOf('type UserType')),
      );
      expect(userTypeBlock).not.toContain('password');
    });
  });
});
