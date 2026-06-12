import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { Role, type User } from '@prisma/client';

registerEnumType(Role, { name: 'Role' });

@ObjectType({ description: 'A platform user — manager, sales rep, or admin' })
export class UserType {
  @Field(() => ID, { description: 'Unique identifier' })
  id!: string;

  @Field(() => String, { description: 'Full name' })
  name!: string;

  @Field(() => String, { description: 'Email address used for login' })
  email!: string;

  @Field(() => Role, { description: 'Role determines access level' })
  role!: Role;

  @Field(() => Date, { description: 'Account creation timestamp' })
  createdAt!: Date;

  @Field(() => Date, { description: 'Last update timestamp' })
  updatedAt!: Date;
}

// password is intentionally excluded from the GraphQL type
type _ScalarFieldsMatch =
  UserType extends Pick<
    User,
    'id' | 'name' | 'email' | 'role' | 'createdAt' | 'updatedAt'
  >
    ? true
    : never;
void (true as _ScalarFieldsMatch); // NOSONAR — compile-time type assertion, void is intentional

/** Minimal projection for salesReps — exposes only id and name, not email or role */
@ObjectType({ description: 'Sales rep summary — id and name only' })
export class SalesRepSummaryType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;
}
