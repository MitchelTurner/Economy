import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PricesService } from './prices.service';

@Controller('prices')
@UseGuards(JwtAuthGuard)
export class PricesController {
  constructor(private readonly prices: PricesService) {}

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
}
