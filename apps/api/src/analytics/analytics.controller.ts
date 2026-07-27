import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('spend')
  spend(
    @CurrentUser() user: AuthUser,
    @Query('groupBy') groupBy?: 'category' | 'store' | 'month',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.spend(user, { groupBy, from, to });
  }

  @Get('habits')
  habits(@CurrentUser() user: AuthUser) {
    return this.analytics.habits(user);
  }
}
