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

  @Field(() => Float, { nullable: true, description: 'Median approved deal size — null when nothing was approved' })
  medianDealSize!: number | null;

  @Field(() => Float, { nullable: true, description: '90th-percentile approved deal size — null when nothing was approved' })
  p90DealSize!: number | null;

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

@ObjectType({ description: 'Per-rep revenue and win rate, top reps by approved revenue' })
export class RepPerformanceType {
  @Field(() => String, { nullable: true, description: 'User.id — null on the aggregated "others" row' })
  repId!: string | null;

  @Field(() => String, { description: 'Rep name, or "N others" on the aggregated row' })
  repName!: string;

  @Field(() => Boolean, { description: 'True for the row aggregating every rep outside the top 10' })
  isOthers!: boolean;

  @Field(() => Int, { description: 'Quotations that reached the client (SENT + APPROVED + REJECTED)' })
  totalSent!: number;

  @Field(() => Int, { description: 'Quotations that were approved' })
  totalApproved!: number;

  @Field(() => Float, { description: 'Total value of APPROVED quotations' })
  approvedRevenue!: number;

  @Field(() => Float, { description: 'approved / (approved + rejected) as a percentage, 1dp' })
  winRate!: number;
}

@ObjectType({ description: 'Top clients by approved revenue and their share of the total' })
export class ClientConcentrationType {
  @Field(() => String)
  clientId!: string;

  @Field(() => String)
  clientName!: string;

  @Field(() => Float, { description: 'Total value of APPROVED quotations for this client' })
  approvedRevenue!: number;

  @Field(() => Float, { description: 'Share of total approved revenue as a percentage, 1dp' })
  shareOfTotal!: number;

  @Field(() => Int, { description: 'Number of APPROVED quotations for this client' })
  quoteCount!: number;
}

@ObjectType({ description: 'Approval rate for one calendar month, by status-change date' })
export class ApprovalRateMonthType {
  @Field(() => String, { description: 'ISO month e.g. "2026-01" (UTC)' })
  month!: string;

  @Field(() => Int, { description: 'Quotations sent to the client during this month' })
  sent!: number;

  @Field(() => Int, { description: 'Quotations approved during this month' })
  approved!: number;

  @Field(() => Int, { description: 'Quotations rejected during this month' })
  rejected!: number;

  @Field(() => Float, {
    nullable: true,
    description: 'approved / (approved + rejected) as a percentage, 1dp — null when nothing was decided',
  })
  rate!: number | null;
}

@ObjectType({ description: 'Time spent in one pipeline transition, from StatusHistory' })
export class DealVelocityType {
  @Field(() => String, { description: 'DRAFT_TO_SENT | SENT_TO_APPROVED | SENT_TO_REJECTED | FULL_CYCLE' })
  transition!: string;

  @Field(() => Float, { nullable: true, description: 'Mean duration in days, 1dp — null when sampleSize is 0' })
  avgDays!: number | null;

  @Field(() => Float, { nullable: true, description: '90th-percentile duration in days, 1dp — null when sampleSize is 0' })
  p90Days!: number | null;

  @Field(() => Int, { description: 'Transitions completed in the period' })
  sampleSize!: number;
}

@ObjectType({ description: 'A SENT quotation with no status change past the stale threshold' })
export class StaleQuotationType {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  quotationNumber!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  clientId!: string;

  @Field(() => String)
  clientName!: string;

  @Field(() => String, { description: 'Name of the rep who created the quotation' })
  repName!: string;

  @Field(() => Float, { description: 'Deal value' })
  total!: number;

  @Field(() => String, { description: 'ISO datetime of the last change — the send, for a SENT quotation' })
  sentAt!: string;

  @Field(() => Int, { description: 'Whole days since sentAt' })
  daysStale!: number;
}

@ObjectType({ description: 'Stale SENT quotations — the list is capped, the totals are not' })
export class StalePipelineType {
  @Field(() => Int, { description: 'Threshold actually applied, after clamping to 1–365' })
  thresholdDays!: number;

  @Field(() => Int, { description: 'All stale quotations, not just the returned items' })
  totalCount!: number;

  @Field(() => Float, { description: 'Combined value of all stale quotations' })
  totalValue!: number;

  @Field(() => [StaleQuotationType], { description: 'Most stale first, at most 50' })
  items!: StaleQuotationType[];
}

@ObjectType()
export class QuarterTopClientType {
  @Field(() => String)
  clientId!: string;

  @Field(() => String)
  name!: string;

  @Field(() => Float, { description: 'Approved revenue in the quarter' })
  revenue!: number;
}

@ObjectType({ description: 'KPI aggregates for one calendar quarter (UTC), by createdAt' })
export class QuarterStatsType {
  @Field(() => String, { description: 'Label e.g. "Q3 2026"' })
  quarter!: string;

  @Field(() => String, { description: 'ISO start of the quarter (inclusive)' })
  from!: string;

  @Field(() => String, { description: 'ISO end of the quarter (inclusive)' })
  to!: string;

  @Field(() => Boolean, { description: 'True for the quarter still in progress' })
  isCurrent!: boolean;

  @Field(() => Int)
  totalQuotations!: number;

  @Field(() => Int)
  totalApproved!: number;

  @Field(() => Float, { description: 'Total value of SENT + APPROVED quotations — open plus won' })
  pipelineValue!: number;

  @Field(() => Float, { description: 'Total value of APPROVED quotations' })
  approvedRevenue!: number;

  @Field(() => Float, { description: 'approved / (approved + rejected) as a percentage, 1dp' })
  winRate!: number;

  @Field(() => Float, { description: 'approvedRevenue / totalApproved' })
  avgDealSize!: number;

  @Field(() => [QuarterTopClientType], { description: 'Top 2 clients by approved revenue' })
  topClients!: QuarterTopClientType[];
}

@ObjectType({ description: 'Approved vs rejected quotations in one deal-size band' })
export class DealSizeCellType {
  @Field(() => String, { description: '"<5k" | "5k–20k" | ">20k" (quotation total, EUR)' })
  bucket!: string;

  @Field(() => Int)
  approved!: number;

  @Field(() => Int)
  rejected!: number;

  @Field(() => Int, { description: 'approved + rejected — the sample behind winRate' })
  decided!: number;

  @Field(() => Float, { nullable: true, description: 'approved / decided as a percentage, 1dp — null when nothing was decided' })
  winRate!: number | null;
}

@ObjectType({ description: "One rep's win rate in each deal-size band" })
export class RepDealSizeRowType {
  @Field(() => String)
  repId!: string;

  @Field(() => String)
  repName!: string;

  @Field(() => Int, { description: 'Decided quotations across all bands' })
  decided!: number;

  @Field(() => Float, { nullable: true, description: 'Overall win rate across all bands, 1dp' })
  winRate!: number | null;

  @Field(() => [DealSizeCellType], { description: 'One cell per band, in bucket order' })
  cells!: DealSizeCellType[];
}

@ObjectType({ description: 'Win rate by rep × deal size, with team averages per band' })
export class RepDealSizeWinRatesType {
  @Field(() => [String], { description: 'Band labels in display order' })
  buckets!: string[];

  @Field(() => [DealSizeCellType], { description: 'Whole team per band — the comparison baseline' })
  teamAverage!: DealSizeCellType[];

  @Field(() => [RepDealSizeRowType], { description: 'Reps on this page, most decided deals first' })
  reps!: RepDealSizeRowType[];

  @Field(() => Int, { description: 'All reps with a decided quotation, across every page' })
  totalReps!: number;

  @Field(() => Int)
  offset!: number;

  @Field(() => Int)
  limit!: number;
}
