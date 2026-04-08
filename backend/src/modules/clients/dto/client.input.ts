import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class ClientInput {
  @Field(() => String)
  name!: string;

  @Field(() => String)
  company!: string;

  @Field(() => String)
  email!: string;

  @Field(() => String, { nullable: true })
  phone?: string;

  @Field(() => String, { nullable: true })
  city?: string;

  @Field(() => String, { nullable: true })
  country?: string;
}
