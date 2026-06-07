import { InputType, Field, Float } from '@nestjs/graphql';
import { QuotationStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@InputType()
export class QuotationFilterInput {
  @Field(() => QuotationStatus, { nullable: true })
  status?: QuotationStatus;

  @Field(() => String, { nullable: true })
  search?: string;

  @Field(() => String, { nullable: true })
  repId?: string;

  /** Called by the quotations service before passing repId to Prisma */
  static validateRepId(repId: string | undefined): void {
    if (repId !== undefined && !UUID_RE.test(repId)) {
      throw new BadRequestException('repId must be a valid UUID');
    }
  }
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
