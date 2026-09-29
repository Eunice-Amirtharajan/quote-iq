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
      expect(schema).toContain('dashboardStats(range: DateRangeInput): DashboardStatsType!');
    });
  });

  describe('Query.repPerformance', () => {
    it('accepts an optional range and a limit defaulting to 10', () => {
      expect(schema).toMatch(
        /repPerformance\(\s*("""[^"]*"""\s*)?limit: Int! = 10\s+range: DateRangeInput\s*\): \[RepPerformanceType!\]!/,
      );
    });
  });

  describe('DashboardStatsType deal size distribution', () => {
    it('exposes nullable median and p90 deal size', () => {
      expect(schema).toMatch(/^\s*medianDealSize: Float$/m);
      expect(schema).toMatch(/^\s*p90DealSize: Float$/m);
    });
  });

  describe('QuarterStatsType.pipelineValue', () => {
    it('is non-nullable', () => {
      expect(schema).toContain('pipelineValue: Float!');
    });
  });

  describe('Query.repDealSizeWinRates', () => {
    it('accepts a range and paging args and returns a non-nullable heatmap', () => {
      expect(schema).toMatch(
        /repDealSizeWinRates\(\s*("""[^"]*"""\s*)?limit: Int! = 10\s+offset: Int! = 0\s+range: DateRangeInput\s*\): RepDealSizeWinRatesType!/,
      );
    });

    it('exposes a nullable win rate per cell so empty bands are not reported as 0%', () => {
      expect(schema).toMatch(/type DealSizeCellType \{[^}]*winRate: Float\n/);
    });
  });

  describe('Query.clientConcentration', () => {
    it('accepts an optional range and returns a non-nullable list', () => {
      expect(schema).toContain('clientConcentration(range: DateRangeInput): [ClientConcentrationType!]!');
    });
  });

  describe('Query.approvalRateTrend', () => {
    it('takes no args and returns a non-nullable list', () => {
      expect(schema).toContain('approvalRateTrend: [ApprovalRateMonthType!]!');
    });
  });

  describe('Query.dealVelocity', () => {
    it('accepts an optional range and returns a non-nullable list', () => {
      expect(schema).toContain('dealVelocity(range: DateRangeInput): [DealVelocityType!]!');
    });
  });

  describe('Query.staleQuotations', () => {
    it('defaults thresholdDays to 14 and returns a non-nullable pipeline', () => {
      expect(schema).toContain('staleQuotations(thresholdDays: Int! = 14): StalePipelineType!');
    });
  });

  describe('Query.quarterlyHistory', () => {
    it('defaults quarters to 4 and returns a non-nullable list', () => {
      expect(schema).toContain('quarterlyHistory(quarters: Int! = 4): [QuarterStatsType!]!');
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

    it('exposes client as ClientType relation', () => {
      const quotationTypeBlock = schema.slice(
        schema.indexOf('type QuotationType'),
        schema.indexOf('}', schema.indexOf('type QuotationType')),
      );
      expect(quotationTypeBlock).toContain('client: ClientType!');
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
