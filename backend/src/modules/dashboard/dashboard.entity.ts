import { ObjectType, Field, Int, Float, InputType } from '@nestjs/graphql';

@InputType()
export class DateRangeInput {
  @Field(() => String, { nullable: true, description: 'ISO-8601 start date (inclusive)' })
  from?: string;

  @Field(() => String, { nullable: true, description: 'ISO-8601 end date (inclusive)' })
  to?: string;
}

@ObjectType()
export class TrendIndicator {
  @Field(() => Float, { description: 'Absolute change vs previous equivalent period' })
  delta!: number;

  @Field(() => Float, { description: 'Percentage change vs previous equivalent period' })
  pct!: number;

  @Field(() => String, { description: 'up | down | flat' })
  direction!: string;
}

@ObjectType({ description: 'Aggregated pipeline statistics for the dashboard' })
export class DashboardStatsType {
  @Field(() => Int, { description: 'Total number of quotations' })
  totalQuotations!: number;

  @Field(() => Int, { description: 'Quotations currently in SENT status' })
  totalSent!: number;

  @Field(() => Int, { description: 'Quotations that were approved' })
  totalApproved!: number;

  @Field(() => Int, { description: 'Quotations that were rejected' })
  totalRejected!: number;

  @Field(() => Float, { description: 'Approval rate as percentage e.g. 33.3' })
  conversionRate!: number;

  @Field(() => Float, { description: 'Total value of all SENT quotations' })
  totalPipelineValue!: number;

  @Field(() => Float, { description: 'Total value of all APPROVED quotations' })
  totalApprovedValue!: number;

  @Field(() => Float, { description: 'Average deal size across approved quotations' })
  avgDealSize!: number;

  // Trend indicators — null when there is no previous period to compare against
  @Field(() => TrendIndicator, { nullable: true })
  totalQuotationsTrend?: TrendIndicator | null;

  @Field(() => TrendIndicator, { nullable: true })
  conversionRateTrend?: TrendIndicator | null;

  @Field(() => TrendIndicator, { nullable: true })
  totalPipelineValueTrend?: TrendIndicator | null;

  @Field(() => TrendIndicator, { nullable: true })
  totalApprovedValueTrend?: TrendIndicator | null;

  @Field(() => TrendIndicator, { nullable: true })
  avgDealSizeTrend?: TrendIndicator | null;
}
