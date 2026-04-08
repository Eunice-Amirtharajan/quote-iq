import { ObjectType, Field, ID, Float, Int } from '@nestjs/graphql';

@ObjectType()
export class QuotationItem {
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
}
