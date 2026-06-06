import { InputType, Field, Float } from '@nestjs/graphql';
import { QuotationStatus } from '@prisma/client';

@InputType()
export class QuotationFilterInput {
  @Field(() => QuotationStatus, { nullable: true })
  status?: QuotationStatus;

  @Field(() => String, { nullable: true })
  search?: string;

  @Field(() => String, { nullable: true })
  repId?: string;
}

@InputType()
export class QuotationItemInput {
  @Field(() => String)
  description!: string;

  @Field(() => Float)
  quantity!: number;

  @Field(() => Float)
  unitPrice!: number;
}

@InputType()
export class CreateQuotationInput {
  @Field(() => String)
  title!: string;

  @Field(() => String)
  clientName!: string;

  @Field(() => String, { nullable: true })
  notes?: string;

  @Field(() => Float, { nullable: true })
  taxRate?: number;

  @Field(() => [QuotationItemInput])
  items!: QuotationItemInput[];
}

@InputType()
export class UpdateQuotationStatusInput {
  @Field(() => QuotationStatus)
  status!: QuotationStatus;

  @Field(() => String, { nullable: true })
  note?: string;
}

@InputType()
export class UpdateQuotationInput {
  @Field(() => String, { nullable: true })
  title?: string;

  @Field(() => String, { nullable: true })
  clientName?: string;

  @Field(() => String, { nullable: true })
  notes?: string;

  @Field(() => Float, { nullable: true })
  taxRate?: number;

  @Field(() => [QuotationItemInput], { nullable: true })
  items?: QuotationItemInput[];
}
