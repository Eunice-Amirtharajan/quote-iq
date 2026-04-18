import { ObjectType, Field, registerEnumType } from '@nestjs/graphql';

export enum Recommendation {
  PROCEED = 'PROCEED',
  FOLLOW_UP = 'FOLLOW_UP',
  RECONSIDER = 'RECONSIDER',
}

registerEnumType(Recommendation, { name: 'Recommendation' });

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
