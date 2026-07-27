import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { InsightsService } from './insights.service';

@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('active') active?: string) {
    return this.insights.list(user, active !== 'false');
  }

  @Post(':id/dismiss')
  dismiss(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.insights.dismiss(user, id);
  }
}
