import {
  ObjectType,
  Field,
  Int,
  Float,
  registerEnumType,
} from '@nestjs/graphql';

export enum Recommendation {
  PROCEED = 'PROCEED',
  FOLLOW_UP = 'FOLLOW_UP',
  RECONSIDER = 'RECONSIDER',
}

export enum ConversionLabel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

registerEnumType(Recommendation, { name: 'Recommendation' });
registerEnumType(ConversionLabel, { name: 'ConversionLabel' });

@ObjectType({ description: 'AI-generated quotation intelligence summary' })
export class QuotationSummaryType {
  @Field(() => String, { description: 'AI assessment of the deal' })
  summary!: string;

  @Field(() => Recommendation, { description: 'Action recommendation' })
  recommendation!: Recommendation;

  @Field(() => [String], { description: 'Key positive signals' })
  keyPoints!: string[];

  @Field(() => [String], { description: 'Risk factors to consider' })
  riskFactors!: string[];
}

@ObjectType({
  description: 'Deterministic conversion likelihood score for a SENT quotation',
})
export class ConversionScoreType {
  @Field(() => Int, { description: 'Score 0–100' })
  score!: number;

  @Field(() => ConversionLabel, {
    description: 'HIGH ≥ 65, MEDIUM ≥ 35, LOW < 35',
  })
  label!: ConversionLabel;
}

@ObjectType({ description: 'Approval stats for a single sales rep' })
export class RepStatType {
  @Field(() => String)
  repName!: string;

  @Field(() => Int)
  sent!: number;

  @Field(() => Int)
  approved!: number;

  @Field(() => Int)
  rejected!: number;

  @Field(() => Float)
  approvalRate!: number;
}

@ObjectType({ description: 'Approval stats for a deal-size bucket' })
export class BucketStatType {
  @Field(() => String, { description: 'e.g. "<5k", "5k–20k", ">20k"' })
  bucket!: string;

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  approved!: number;

  @Field(() => Float)
  approvalRate!: number;
}

@ObjectType({ description: 'Answer to a free-text question about a quotation' })
export class QuotationAnswerType {
  @Field(() => String)
  answer!: string;
}

@ObjectType({
  description: 'Aggregated win/loss analysis across all quotations',
})
export class WinLossStatsType {
  @Field(() => Float, { description: 'Overall approval rate 0–100' })
  approvalRate!: number;

  @Field(() => Float, {
    description: 'Average deal size of approved quotations',
  })
  avgApprovedDeal!: number;

  @Field(() => Float, {
    description: 'Average deal size of rejected quotations',
  })
  avgRejectedDeal!: number;

  @Field(() => [RepStatType])
  byRep!: RepStatType[];

  @Field(() => [BucketStatType])
  byDealSize!: BucketStatType[];
}
