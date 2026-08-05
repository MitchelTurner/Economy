import { Body, Controller, Delete, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateMeDto,
} from './auth.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { clientKeyFromReq, consumeRateLimit } from '../common/rate-limit';

function authLimit() {
  return {
    name: 'auth',
    limit: Number(process.env.RATE_LIMIT_AUTH ?? 30),
    windowMs: 60_000,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Req() req: Request, @Body() dto: RegisterDto) {
    await consumeRateLimit(clientKeyFromReq(req), {
      ...authLimit(),
      name: 'auth:register',
    });
    return this.auth.register(dto, clientKeyFromReq(req));
  }

  @Post('login')
  async login(@Req() req: Request, @Body() dto: LoginDto) {
    await consumeRateLimit(clientKeyFromReq(req), {
      ...authLimit(),
      name: 'auth:login',
    });
    return this.auth.login(dto, clientKeyFromReq(req));
  }

  /** Email remembered for this client IP (password is never stored). */
  @Get('saved-login')
  async savedLogin(@Req() req: Request) {
    await consumeRateLimit(clientKeyFromReq(req), {
      ...authLimit(),
      name: 'auth:saved-login',
    });
    return this.auth.getSavedLogin(clientKeyFromReq(req));
  }

  @Delete('saved-login')
  async clearSavedLogin(@Req() req: Request) {
    await consumeRateLimit(clientKeyFromReq(req), {
      ...authLimit(),
      name: 'auth:saved-login-clear',
    });
    return this.auth.clearSavedLogin(clientKeyFromReq(req));
  }

  @Get('demo')
  demoStatus() {
    return this.auth.demoStatus();
  }

  @Post('demo-login')
  async demoLogin(@Req() req: Request) {
    await consumeRateLimit(clientKeyFromReq(req), {
      ...authLimit(),
      name: 'auth:demo-login',
    });
    return this.auth.demoLogin();
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Body() dto: RefreshDto) {
    await consumeRateLimit(clientKeyFromReq(req), {
      ...authLimit(),
      name: 'auth:refresh',
    });
    return this.auth.refresh(dto);
  }

  @Post('logout')
  async logout(@Req() req: Request, @Body() dto: RefreshDto) {
    await consumeRateLimit(clientKeyFromReq(req), {
      ...authLimit(),
      name: 'auth:logout',
    });
    return this.auth.logout(dto);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentUser() user: AuthUser) {
    await consumeRateLimit(user.userId, {
      ...authLimit(),
      name: 'auth:logout-all',
    });
    return this.auth.logoutAll(user.userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    await consumeRateLimit(user.userId, {
      ...authLimit(),
      name: 'auth:me',
    });
    return this.auth.updateMe(user.userId, dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    await consumeRateLimit(user.userId, {
      ...authLimit(),
      name: 'auth:change-password',
    });
    return this.auth.changePassword(user.userId, dto);
  }

  @Post('forgot-password')
  async forgotPassword(@Req() req: Request, @Body() dto: ForgotPasswordDto) {
    await consumeRateLimit(clientKeyFromReq(req), {
      ...authLimit(),
      name: 'auth:forgot-password',
    });
    return this.auth.forgotPassword(dto);
  }

  @Post('reset-password')
  async resetPassword(@Req() req: Request, @Body() dto: ResetPasswordDto) {
    await consumeRateLimit(clientKeyFromReq(req), {
      ...authLimit(),
      name: 'auth:reset-password',
    });
    return this.auth.resetPassword(dto);
  }
}
