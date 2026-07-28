import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './auth.dto';
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
    return this.auth.register(dto);
  }

  @Post('login')
  async login(@Req() req: Request, @Body() dto: LoginDto) {
    await consumeRateLimit(clientKeyFromReq(req), {
      ...authLimit(),
      name: 'auth:login',
    });
    return this.auth.login(dto);
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
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }
}
