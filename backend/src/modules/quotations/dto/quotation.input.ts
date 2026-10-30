import {
  InputType,
  Field,
  Float,
  Int,
  ID,
  GraphQLISODateTime,
} from '@nestjs/graphql';
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

/**
 * Keyset cursor for the quotations list: the createdAt and id of the last row already shown.
 * The next page is the rows strictly after it in (createdAt DESC, id DESC) order, so rows created
 * while paging can't shift a page (OFFSET's duplicates and skips), and a deep page costs the same
 * as the first. Both values come from a row the client has, so a deleted row is still a valid cursor.
 */
@InputType()
export class QuotationCursorInput {
  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => ID)
  id!: string;

  static validate(cursor: QuotationCursorInput | undefined): void {
    if (cursor === undefined) return;
    if (!UUID_RE.test(cursor.id)) {
      throw new BadRequestException('after.id must be a valid UUID');
    }
    if (Number.isNaN(new Date(cursor.createdAt).getTime())) {
      throw new BadRequestException('after.createdAt must be a valid date');
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

  @Field(() => Int, { nullable: true })
  sortOrder?: number;
}

@InputType()
export class CreateQuotationInput {
  @Field(() => String)
  title!: string;

  @Field(() => ID)
  clientId!: string;

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

  @Field(() => Int)
  version!: number;

  @Field(() => ID, { nullable: true })
  clientId?: string;

  @Field(() => String, { nullable: true })
  notes?: string;

  @Field(() => Float, { nullable: true })
  taxRate?: number;

  @Field(() => [QuotationItemInput], { nullable: true })
  items?: QuotationItemInput[];
}
