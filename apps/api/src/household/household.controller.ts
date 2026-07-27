import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { HouseholdService } from './household.service';
import { AcceptInviteDto, InviteDto } from './household.dto';

@Controller('household')
export class HouseholdController {
  constructor(private readonly household: HouseholdService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  members(@CurrentUser() user: AuthUser) {
    return this.household.members(user);
  }

  @Post('invites')
  @UseGuards(JwtAuthGuard)
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteDto) {
    return this.household.invite(user, dto);
  }

  @Post('invites/accept')
  accept(@Body() dto: AcceptInviteDto) {
    return this.household.acceptInvite(dto);
  }

  @Get('export')
  @UseGuards(JwtAuthGuard)
  export(@CurrentUser() user: AuthUser) {
    return this.household.exportData(user);
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  hardDelete(@CurrentUser() user: AuthUser) {
    return this.household.hardDelete(user);
  }
}
