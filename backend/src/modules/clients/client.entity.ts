import { ObjectType, Field, ID } from '@nestjs/graphql';
import type { Client } from '@prisma/client';

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

  createdById!: string;
}

type _ScalarFieldsMatch =
  ClientType extends Pick<
    Client,
    | 'id'
    | 'name'
    | 'company'
    | 'email'
    | 'phone'
    | 'city'
    | 'country'
    | 'createdAt'
    | 'updatedAt'
    | 'createdById' // kept on class for service-layer use; not exposed in schema
  >
    ? true
    : never;
void (true as _ScalarFieldsMatch);
