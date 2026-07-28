import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { consumeRateLimit } from '../common/rate-limit';
import { InsightsService } from './insights.service';

@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('active') active?: string) {
    return this.insights.list(user, active !== 'false');
  }

  @Get('digest')
  digest(@CurrentUser() user: AuthUser) {
    return this.insights.weeklyDigest(user);
  }

  @Get('behavior')
  behavior(@CurrentUser() user: AuthUser) {
    return this.insights.behaviorSummary(user);
  }

  @Post('generate')
  async generate(@CurrentUser() user: AuthUser) {
    await consumeRateLimit(`${user.userId}:${user.householdId}`, {
      name: 'insights:generate',
      limit: Number(process.env.RATE_LIMIT_HOUSEHOLD ?? 20),
      windowMs: 60_000,
    });
    return this.insights.generateForHousehold(user.householdId);
  }

  @Post(':id/dismiss')
  dismiss(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.insights.dismiss(user, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.insights.restore(user, id);
  }
}
