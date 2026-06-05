import { ObjectType, Field, ID, Float, Int } from '@nestjs/graphql';
import type { QuotationItem } from '@prisma/client';

@ObjectType()
export class QuotationItemType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  description!: string;

  @Field(() => Float)
  quantity!: number;

  @Field(() => Float)
  unitPrice!: number;

  @Field(() => Float)
  lineTotal!: number;

  @Field(() => Int)
  sortOrder!: number;

  quotationId!: string;
}

type _ScalarFieldsMatch =
  QuotationItemType extends Pick<
    QuotationItem,
    | 'id'
    | 'description'
    | 'quantity'
    | 'unitPrice'
    | 'lineTotal'
    | 'sortOrder'
    | 'quotationId' // kept on class for service-layer use; not exposed in schema
  >
    ? true
    : never;
void (true as _ScalarFieldsMatch);
