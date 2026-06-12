import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(join(__dirname, 'schema.gql'), 'utf-8');

describe('GraphQL schema contract', () => {
  describe('Query.quotations', () => {
    it('exposes nullable skip, take, and filter args', () => {
      expect(schema).toContain('quotations(');
      expect(schema).toContain('filter: QuotationFilterInput');
      expect(schema).toContain('skip: Int');
      expect(schema).toContain('take: Int');
    });
  });

  describe('Query.quotation', () => {
    it('accepts an ID arg and is nullable', () => {
      expect(schema).toContain('quotation(id: ID!): QuotationType');
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

  describe('QuotationType', () => {
    it('does not expose createdById or clientId FK scalars', () => {
      const quotationTypeBlock = schema.slice(
        schema.indexOf('type QuotationType'),
        schema.indexOf('}', schema.indexOf('type QuotationType')),
      );
      expect(quotationTypeBlock).not.toContain('createdById');
      expect(quotationTypeBlock).not.toContain('clientId');
    });

    it('exposes clientName as a String scalar', () => {
      const quotationTypeBlock = schema.slice(
        schema.indexOf('type QuotationType'),
        schema.indexOf('}', schema.indexOf('type QuotationType')),
      );
      expect(quotationTypeBlock).toContain('clientName: String!');
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
