import {
  ObjectType,
  Field,
  ID,
  Float,
  registerEnumType,
} from '@nestjs/graphql';
import { QuotationStatus } from '@prisma/client';
import { QuotationItem } from './quotation-item.entity';
import { Client } from '../clients/client.entity';
import { User } from '../users/user.entity';

registerEnumType(QuotationStatus, { name: 'QuotationStatus' });

@ObjectType()
export class Quotation {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  quotationNumber!: string;

  @Field(() => String)
  title!: string;

  @Field(() => QuotationStatus)
  status!: QuotationStatus;

  @Field(() => String, { nullable: true })
  notes?: string;

  @Field(() => Float)
  taxRate!: number;

  @Field(() => Float)
  subtotal!: number;

  @Field(() => Float)
  taxAmount!: number;

  @Field(() => Float)
  total!: number;

  @Field(() => Date, { nullable: true })
  validUntil?: Date;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => [QuotationItem], { nullable: true })
  items?: QuotationItem[];

  @Field(() => Client, { nullable: true })
  client?: Client;

  @Field(() => User, { nullable: true })
  createdBy?: User;
}
