import {
  ObjectType,
  Field,
  ID,
  Float,
  Int,
  registerEnumType,
} from '@nestjs/graphql';
import { QuotationItemType } from './quotation-item.entity';
import { UserType } from '../users/user.entity';
import { ClientType } from '../clients/client.entity';
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

  @Field(() => ClientType, { description: 'Associated client' })
  client!: ClientType;

  clientId!: string;

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

  @Field(() => Int, { description: 'Optimistic concurrency version' })
  version!: number;

  @Field(() => Date, { description: 'Creation timestamp' })
  createdAt!: Date;

  @Field(() => String, {
    description: 'Public token for accessing the quotation',
  })
  publicToken!: string;

  @Field(() => [QuotationItemType])
  items!: QuotationItemType[];

  @Field(() => UserType)
  createdBy!: UserType;

  createdById!: string;
}

// clientId is a non-exposed FK scalar (see architecture constraint) — excluded from Pick
type _ScalarFieldsMatch =
  QuotationType extends Pick<
    Quotation,
    | 'id'
    | 'quotationNumber'
    | 'title'
    | 'status'
    | 'notes'
    | 'taxRate'
    | 'subtotal'
    | 'taxAmount'
    | 'total'
    | 'version'
    | 'createdAt'
    | 'createdById'
  >
    ? true
    : never;
void (true as _ScalarFieldsMatch); // NOSONAR — compile-time type assertion, void is intentional

@ObjectType({
  description: 'A public sales quotation with line items and calculated totals',
})
export class PublicQuotationType {
  @Field(() => String, {
    description: 'Auto-generated number e.g. QT-2026-0001',
  })
  quotationNumber!: string;

  @Field(() => String, { description: 'Quotation title or subject' })
  title!: string;

  @Field(() => String, { description: 'Client name for public display' })
  clientName!: string;

  @Field(() => String, { description: 'Rep display name for public display' })
  repName!: string;

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

  @Field(() => [QuotationItemType])
  items!: QuotationItemType[];
}

// clientName and repName on PublicQuotationType are derived at query time — not Prisma scalars
type _PublicScalarFieldsMatch =
  PublicQuotationType extends Pick<
    Quotation,
    | 'quotationNumber'
    | 'title'
    | 'status'
    | 'notes'
    | 'taxRate'
    | 'subtotal'
    | 'taxAmount'
    | 'total'
  >
    ? true
    : never;
void (true as _PublicScalarFieldsMatch); // NOSONAR — compile-time type assertion, void is intentional
