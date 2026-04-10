import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { Role } from '@prisma/client';

registerEnumType(Role, { name: 'Role' });

@ObjectType()
export class UserType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  email!: string;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  @Field(() => Role)
  role!: Role;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}
