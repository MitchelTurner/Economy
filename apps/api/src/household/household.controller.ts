import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { clientKeyFromReq, consumeRateLimit } from '../common/rate-limit';
import { HouseholdService } from './household.service';
import {
  AcceptInviteDto,
  InviteDto,
  RenameHouseholdDto,
  TransferOwnershipDto,
} from './household.dto';

function inviteLimit() {
  return {
    name: 'invite',
    limit: Number(process.env.RATE_LIMIT_INVITE ?? 30),
    windowMs: 60_000,
  };
}

function householdLimit() {
  return {
    name: 'household',
    limit: Number(process.env.RATE_LIMIT_HOUSEHOLD ?? 20),
    windowMs: 60_000,
  };
}

@Controller('household')
export class HouseholdController {
  constructor(private readonly household: HouseholdService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  members(@CurrentUser() user: AuthUser) {
    return this.household.members(user);
  }

  @Patch()
  @UseGuards(JwtAuthGuard)
  rename(@CurrentUser() user: AuthUser, @Body() dto: RenameHouseholdDto) {
    return this.household.rename(user, dto);
  }

  @Post('leave')
  @UseGuards(JwtAuthGuard)
  leave(@CurrentUser() user: AuthUser) {
    return this.household.leave(user);
  }

  @Delete('members/:userId')
  @UseGuards(JwtAuthGuard)
  removeMember(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.household.removeMember(user, userId);
  }

  @Post('transfer')
  @UseGuards(JwtAuthGuard)
  async transfer(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Body() dto: TransferOwnershipDto,
  ) {
    await consumeRateLimit(`${user.userId}:${user.householdId}`, {
      ...householdLimit(),
      name: 'household:transfer',
    });
    return this.household.transferOwnership(user, dto);
  }

  @Post('invites')
  @UseGuards(JwtAuthGuard)
  async invite(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Body() dto: InviteDto,
  ) {
    await consumeRateLimit(`${clientKeyFromReq(req)}:${user.householdId}`, {
      ...inviteLimit(),
      name: 'invite:create',
    });
    return this.household.invite(user, dto);
  }

  @Get('invites/peek')
  async peek(@Req() req: Request, @Query('token') token?: string) {
    await consumeRateLimit(clientKeyFromReq(req), {
      ...inviteLimit(),
      name: 'invite:peek',
    });
    return this.household.peekInvite(token ?? '');
  }

  @Post('invites/accept')
  async accept(@Req() req: Request, @Body() dto: AcceptInviteDto) {
    await consumeRateLimit(clientKeyFromReq(req), {
      ...inviteLimit(),
      name: 'invite:accept',
    });
    return this.household.acceptInvite(dto);
  }

  @Delete('invites/:id')
  @UseGuards(JwtAuthGuard)
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.household.revokeInvite(user, id);
  }

  @Get('export')
  @UseGuards(JwtAuthGuard)
  async export(@Req() req: Request, @CurrentUser() user: AuthUser) {
    await consumeRateLimit(`${user.userId}:${user.householdId}`, {
      ...householdLimit(),
      name: 'household:export',
    });
    return this.household.exportData(user);
  }

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  usage(@CurrentUser() user: AuthUser) {
    return this.household.usage(user);
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  async hardDelete(@Req() req: Request, @CurrentUser() user: AuthUser) {
    await consumeRateLimit(`${user.userId}:${user.householdId}`, {
      ...householdLimit(),
      name: 'household:wipe',
    });
    return this.household.hardDelete(user);
  }
}
