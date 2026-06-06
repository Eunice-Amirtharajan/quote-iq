import { ObjectType, Field, Int, registerEnumType } from '@nestjs/graphql';

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
