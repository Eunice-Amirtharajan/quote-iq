import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

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
}
