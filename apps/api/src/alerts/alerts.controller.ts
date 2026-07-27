import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './alerts.dto';

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
  check(@CurrentUser() user: AuthUser) {
    return this.alerts.checkHousehold(user.householdId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.alerts.remove(user, id);
  }
}
