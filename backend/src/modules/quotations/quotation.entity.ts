import {
  ObjectType,
  Field,
  ID,
  Float,
  registerEnumType,
} from '@nestjs/graphql';
import { QuotationItemType } from './quotation-item.entity';
import { ClientType } from '../clients/client.entity';
import { UserType } from '../users/user.entity';
import { QuotationStatus } from '@prisma/client';

registerEnumType(QuotationStatus, { name: 'QuotationStatus' });

@ObjectType()
export class QuotationType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  quotationNumber!: string;

  @Field(() => String)
  title!: string;

  @Field(() => QuotationStatus)
  status!: QuotationStatus;

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => Float)
  taxRate!: number;

  @Field(() => Float)
  subtotal!: number;

  @Field(() => Float)
  taxAmount!: number;

  @Field(() => Float)
  total!: number;

  @Field(() => Date, { nullable: true })
  validUntil?: Date | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => [QuotationItemType], { nullable: true })
  items?: QuotationItemType[] | null;

  @Field(() => ClientType, { nullable: true })
  client?: ClientType | null;

  @Field(() => UserType, { nullable: true })
  createdBy?: UserType | null;
}
