import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import { parseSpendQuery } from './analytics.helpers';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('spend')
  spend(
    @CurrentUser() user: AuthUser,
    @Query('groupBy') groupBy?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    let parsed: ReturnType<typeof parseSpendQuery>;
    try {
      parsed = parseSpendQuery({ groupBy, from, to });
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    return this.analytics.spend(user, parsed);
  }

  @Get('habits')
  habits(@CurrentUser() user: AuthUser) {
    return this.analytics.habits(user);
  }

  /** Inflation, tax paid, and category/product price movers for the island basket. */
  @Get('economy')
  economy(
    @CurrentUser() user: AuthUser,
    @Query('region') region?: string,
  ) {
    return this.analytics.economy(user, region?.trim() || 'ketchikan');
  }
}
