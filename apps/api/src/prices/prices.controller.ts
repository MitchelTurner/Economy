import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PricesService } from './prices.service';
import { IndexRollupService } from './index-rollup.service';

@Controller('prices')
@UseGuards(JwtAuthGuard)
export class PricesController {
  constructor(
    private readonly prices: PricesService,
    private readonly rollup: IndexRollupService,
  ) {}

  @Get('product/:id/history')
  history(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('storeId') storeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.prices.history(user, id, { storeId, from, to });
  }

  @Get('compare')
  compare(@CurrentUser() user: AuthUser, @Query('productIds') productIds?: string) {
    const ids = (productIds ?? '').split(',').filter(Boolean);
    return this.prices.compare(user, ids);
  }

  @Get('index')
  index(
    @Query('basket') basket = 'staples-25',
    @Query('region') region = 'ketchikan',
  ) {
    return this.prices.index(basket, region);
  }

  @Get('premium/:productId')
  premium(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    return this.prices.premium(user, productId);
  }

  /** Manual trigger for nightly rollup (also runs on cron). */
  @Post('index/rollup')
  rollupNow() {
    return this.rollup.rollupAll();
  }

  @Get('shipping-lanes')
  shippingLanes(@Query('destRegion') destRegion = 'ketchikan') {
    return this.prices.listShippingLanes(destRegion);
  }

  @Get('delivered/:productId')
  delivered(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
    @Query('laneId') laneId?: string,
    @Query('quantity') quantity?: string,
  ) {
    return this.prices.deliveredCost(user, productId, {
      laneId,
      quantity: quantity ? Number(quantity) : 1,
    });
  }
}
