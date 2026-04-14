import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { Role } from '@prisma/client';

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
