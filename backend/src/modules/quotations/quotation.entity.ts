import {
  ObjectType,
  Field,
  ID,
  Float,
  registerEnumType,
} from '@nestjs/graphql';
import { QuotationItemType } from './quotation-item.entity';
import { UserType } from '../users/user.entity';
import { QuotationStatus, type Quotation } from '@prisma/client';

registerEnumType(QuotationStatus, { name: 'QuotationStatus' });

@ObjectType({
  description: 'A sales quotation with line items and calculated totals',
})
export class QuotationType {
  @Field(() => ID, { description: 'Unique identifier' })
  id!: string;

  @Field(() => String, {
    description: 'Auto-generated number e.g. QT-2026-0001',
  })
  quotationNumber!: string;

  @Field(() => String, { description: 'Quotation title or subject' })
  title!: string;

  @Field(() => String, { description: 'Free-text client name' })
  clientName!: string;

  @Field(() => QuotationStatus, {
    description: 'Current status in the pipeline',
  })
  status!: QuotationStatus;

  @Field(() => String, {
    nullable: true,
    description: 'Optional notes for the client',
  })
  notes?: string | null;

  @Field(() => Float, { description: 'Tax rate as percentage e.g. 19 for 19%' })
  taxRate!: number;

  @Field(() => Float, { description: 'Sum of all line item totals before tax' })
  subtotal!: number;

  @Field(() => Float, {
    description: 'Tax amount calculated from subtotal and taxRate',
  })
  taxAmount!: number;

  @Field(() => Float, { description: 'Final total including tax' })
  total!: number;

  @Field(() => Date, { description: 'Creation timestamp' })
  createdAt!: Date;

  @Field(() => Date, { description: 'Last update timestamp' })
  updatedAt!: Date;

  @Field(() => [QuotationItemType])
  items!: QuotationItemType[];

  @Field(() => UserType)
  createdBy!: UserType;

  createdById!: string;
}

type _ScalarFieldsMatch =
  QuotationType extends Pick<
    Quotation,
    | 'id'
    | 'quotationNumber'
    | 'title'
    | 'clientName'
    | 'status'
    | 'notes'
    | 'taxRate'
    | 'subtotal'
    | 'taxAmount'
    | 'total'
    | 'createdAt'
    | 'updatedAt'
    | 'createdById'
  >
    ? true
    : never;
void (true as _ScalarFieldsMatch);
