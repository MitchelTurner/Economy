import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicIndexService } from './public-index.service';

/** Unauthenticated community endpoints — privacy gate enforced in the service. */
@Controller('public')
export class PublicController {
  constructor(private readonly publicIndex: PublicIndexService) {}

  @Get('index')
  index(
    @Query('region') region = 'ketchikan',
    @Query('basket') basket = 'staples-25',
  ) {
    return this.publicIndex.index(region, basket);
  }

  @Get('prices/:productId')
  prices(
    @Param('productId') productId: string,
    @Query('region') region?: string,
  ) {
    return this.publicIndex.productPrices(productId, region);
  }

  @Get('meta')
  meta() {
    return { minHouseholds: this.publicIndex.getMinHouseholds() };
  }
}
