import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

@ObjectType({ description: 'A client organisation associated with quotations' })
export class ClientType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType()
export class ClientsPageType {
  @Field(() => [ClientType])
  items!: ClientType[];

  @Field(() => Int)
  total!: number;
}
