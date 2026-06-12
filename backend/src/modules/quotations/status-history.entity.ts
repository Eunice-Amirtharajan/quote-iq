import { ObjectType, Field, ID } from '@nestjs/graphql';
import { QuotationStatus, type StatusHistory } from '@prisma/client';
import { UserType } from '../users/user.entity';

@ObjectType({ description: 'A recorded status transition on a quotation' })
export class StatusHistoryType {
  @Field(() => ID)
  id!: string;

  @Field(() => QuotationStatus, { description: 'Status before the transition' })
  fromStatus!: QuotationStatus;

  @Field(() => QuotationStatus, { description: 'Status after the transition' })
  toStatus!: QuotationStatus;

  @Field(() => String, { nullable: true, description: 'Optional note recorded at transition time' })
  note?: string | null;

  @Field(() => Date, { description: 'When the transition occurred' })
  changedAt!: Date;

  @Field(() => UserType, { nullable: true, description: 'User who made the change' })
  changedBy?: UserType | null;

  quotationId!: string;
  changedById?: string | null;
}

type _ScalarFieldsMatch =
  StatusHistoryType extends Pick<
    StatusHistory,
    'id' | 'fromStatus' | 'toStatus' | 'note' | 'changedAt' | 'quotationId' | 'changedById'
  >
    ? true
    : never;
void (true as _ScalarFieldsMatch); // NOSONAR — compile-time type assertion, void is intentional
