import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
export class QuotationSnapshotType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  quotationId!: string;

  @Field(() => String, {
    description: 'JSON-encoded state of the quotation before this edit (title, clientId, notes, taxRate, items)',
  })
  content!: string;

  @Field(() => String)
  createdAt!: string;
}
