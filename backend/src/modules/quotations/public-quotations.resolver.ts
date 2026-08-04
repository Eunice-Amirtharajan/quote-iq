import { Args, Resolver, Query } from '@nestjs/graphql';
import { PublicQuotationType } from './quotation.entity';
import { QuotationsService } from './quotations.service';

@Resolver(() => PublicQuotationType)
export class PublicQuotationsResolver {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Query(/* istanbul ignore next */ () => PublicQuotationType, {
    nullable: true,
  })
  async quotationByToken(
    @Args('token') token: string,
  ): Promise<PublicQuotationType | null> {
    return this.quotationsService.findByToken(token);
  }
}
