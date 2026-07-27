import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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

  @Get('invites/peek')
  peek(@Query('token') token?: string) {
    return this.household.peekInvite(token ?? '');
  }

  @Post('invites/accept')
  accept(@Body() dto: AcceptInviteDto) {
    return this.household.acceptInvite(dto);
  }

  @Delete('invites/:id')
  @UseGuards(JwtAuthGuard)
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.household.revokeInvite(user, id);
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
