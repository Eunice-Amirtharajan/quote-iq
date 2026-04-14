import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType({ description: 'A client or prospect in the system' })
export class ClientType {
  @Field(() => ID, { description: 'Unique identifier' })
  id!: string;

  @Field(() => String, { description: 'Contact person name' })
  name!: string;

  @Field(() => String, { description: 'Company or organisation name' })
  company!: string;

  @Field(() => String, { description: 'Business email address' })
  email!: string;

  @Field(() => String, { nullable: true, description: 'Phone number' })
  phone?: string | null;

  @Field(() => String, { nullable: true, description: 'City' })
  city?: string | null;

  @Field(() => String, { nullable: true, description: 'Country' })
  country?: string | null;

  @Field(() => Date, { description: 'Creation timestamp' })
  createdAt!: Date;

  @Field(() => Date, { description: 'Last update timestamp' })
  updatedAt!: Date;
}
