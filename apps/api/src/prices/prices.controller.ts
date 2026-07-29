import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { consumeRateLimit } from '../common/rate-limit';
import { PricesService } from './prices.service';
import { IndexRollupService } from './index-rollup.service';

const CompareProductIdsSchema = z
  .string()
  .max(2000)
  .optional()
  .transform((raw) =>
    (raw ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().min(1).max(64)).max(40));

const DeliveredQuantitySchema = z.coerce.number().finite().positive().max(10_000);

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
    const parsed = CompareProductIdsSchema.safeParse(productIds);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid productIds (max 40 ids)',
        issues: parsed.error.issues,
      });
    }
    return this.prices.compare(user, parsed.data);
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

  /** Manual trigger for nightly rollup (also runs on cron). Owner-only. */
  @Post('index/rollup')
  async rollupNow(@CurrentUser() user: AuthUser) {
    if (user.role !== 'owner') {
      throw new ForbiddenException('Only household owners can trigger index rollup');
    }
    await consumeRateLimit(`${user.userId}:${user.householdId}`, {
      name: 'prices:rollup',
      limit: Number(process.env.RATE_LIMIT_HOUSEHOLD ?? 20),
      windowMs: 60_000,
    });
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
    const qtyParsed =
      quantity == null || quantity === ''
        ? ({ success: true as const, data: 1 })
        : DeliveredQuantitySchema.safeParse(quantity);
    if (!qtyParsed.success) {
      throw new BadRequestException({
        message: 'Invalid quantity (must be a positive number ≤ 10000)',
        issues: qtyParsed.error.issues,
      });
    }
    return this.prices.deliveredCost(user, productId, {
      laneId,
      quantity: qtyParsed.data,
    });
  }
}
