import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class DashboardStatsType {
  @Field(() => Int)
  totalQuotations!: number;

  @Field(() => Int)
  totalSent!: number;

  @Field(() => Int)
  totalApproved!: number;

  @Field(() => Int)
  totalRejected!: number;

  @Field(() => Float)
  conversionRate!: number;

  @Field(() => Float)
  totalPipelineValue!: number;

  @Field(() => Float)
  totalApprovedValue!: number;
}
