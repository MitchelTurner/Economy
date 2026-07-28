import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { consumeRateLimit } from '../common/rate-limit';
import { AlertsService } from './alerts.service';
import { CreateAlertDto, PatchAlertDto } from './alerts.dto';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.alerts.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAlertDto) {
    return this.alerts.create(user, dto);
  }

  @Post('check')
  async check(@CurrentUser() user: AuthUser) {
    await consumeRateLimit(`${user.userId}:${user.householdId}`, {
      name: 'alerts:check',
      limit: Number(process.env.RATE_LIMIT_HOUSEHOLD ?? 20),
      windowMs: 60_000,
    });
    return this.alerts.checkHousehold(user.householdId);
  }

  @Patch(':id')
  patch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PatchAlertDto,
  ) {
    return this.alerts.patch(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.alerts.remove(user, id);
  }
}
