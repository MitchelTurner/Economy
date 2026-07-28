import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { clientKeyFromReq, consumeRateLimit } from '../common/rate-limit';
import { PublicIndexService } from './public-index.service';

function publicLimit(name: string) {
  return {
    name,
    limit: Number(process.env.RATE_LIMIT_PUBLIC ?? 120),
    windowMs: 60_000,
  };
}

/** Unauthenticated community endpoints — privacy gate enforced in the service. */
@Controller('public')
export class PublicController {
  constructor(private readonly publicIndex: PublicIndexService) {}

  @Get('index')
  async index(
    @Req() req: Request,
    @Query('region') region = 'ketchikan',
    @Query('basket') basket = 'staples-25',
  ) {
    await consumeRateLimit(clientKeyFromReq(req), publicLimit('public:index'));
    return this.publicIndex.index(region, basket);
  }

  @Get('prices/:productId')
  async prices(
    @Req() req: Request,
    @Param('productId') productId: string,
    @Query('region') region?: string,
  ) {
    await consumeRateLimit(clientKeyFromReq(req), publicLimit('public:prices'));
    return this.publicIndex.productPrices(productId, region);
  }

  @Get('staples')
  async staples(@Req() req: Request, @Query('basket') basket = 'staples-25') {
    await consumeRateLimit(clientKeyFromReq(req), publicLimit('public:staples'));
    return this.publicIndex.listStaples(basket);
  }

  @Get('meta')
  async meta(@Req() req: Request) {
    await consumeRateLimit(clientKeyFromReq(req), publicLimit('public:meta'));
    return { minHouseholds: this.publicIndex.getMinHouseholds() };
  }
}
