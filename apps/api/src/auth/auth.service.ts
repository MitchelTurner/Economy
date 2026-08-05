import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateMeDto,
} from './auth.dto';
import { redisConnectionFromUrl } from '../common/redis-connection';

const RESET_TTL_SECONDS = 60 * 60; // 1 hour

export const DEMO_EMAIL = 'demo@islandledger.local';
export const DEMO_PASSWORD = 'demo-password-123';

@Injectable()
export class AuthService {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {
    this.redis = new Redis({
      ...redisConnectionFromUrl(
        this.config.get('REDIS_URL') ?? 'redis://localhost:6379',
      ),
      lazyConnect: true,
    });
    void this.redis.connect().catch(() => {
      // Redis optional at boot for unit tests; login refresh needs it.
    });
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password);
    const household = await this.prisma.household.create({
      data: {
        name: dto.householdName ?? `${dto.displayName ?? dto.email}'s household`,
        users: {
          create: {
            email: dto.email.toLowerCase(),
            passwordHash,
            displayName: dto.displayName,
            role: 'owner',
          },
        },
      },
      include: { users: true },
    });

    const user = household.users[0];
    return this.issueTokens(user.id, user.householdId, user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens(user.id, user.householdId, user.email);
  }

  /**
   * Demo login is on when ALLOW_DEMO_LOGIN=true, or (by default) when
   * ALLOW_MOCK_EXTRACTION is not false — same “this is a demo deploy” signal.
   * Set ALLOW_DEMO_LOGIN=false to lock it down even with mock extraction.
   */
  isDemoLoginEnabled(): boolean {
    const explicit = (this.config.get<string>('ALLOW_DEMO_LOGIN') ?? '').toLowerCase();
    if (explicit === 'false' || explicit === '0' || explicit === 'off') return false;
    if (explicit === 'true' || explicit === '1' || explicit === 'on') return true;
    const allowMock =
      (this.config.get<string>('ALLOW_MOCK_EXTRACTION') ?? 'true').toLowerCase() !== 'false';
    const nodeEnv = (
      this.config.get<string>('NODE_ENV') ??
      process.env.NODE_ENV ??
      'development'
    ).toLowerCase();
    return allowMock || nodeEnv !== 'production';
  }

  demoStatus() {
    return {
      enabled: this.isDemoLoginEnabled(),
      email: DEMO_EMAIL,
    };
  }

  /**
   * One-click demo: ensure the demo household/user exists, reset password to the
   * known demo password, and issue tokens. No seed/history required.
   */
  async demoLogin() {
    if (!this.isDemoLoginEnabled()) {
      throw new ForbiddenException(
        'Demo login is disabled. Set ALLOW_DEMO_LOGIN=true (or ALLOW_MOCK_EXTRACTION=true) on the API service.',
      );
    }

    const passwordHash = await argon2.hash(DEMO_PASSWORD);
    let user = await this.prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (!user) {
      const household = await this.prisma.household.create({
        data: { name: 'Demo Household' },
      });
      user = await this.prisma.user.create({
        data: {
          email: DEMO_EMAIL,
          passwordHash,
          displayName: 'Demo User',
          role: 'owner',
          householdId: household.id,
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          role: 'owner',
          displayName: user.displayName ?? 'Demo User',
        },
      });
    }

    return this.issueTokens(user.id, user.householdId, user.email);
  }

  async refresh(dto: RefreshDto) {
    let payload: { sub: string; householdId: string; email: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(dto.refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const key = this.refreshKey(payload.sub, dto.refreshToken);
    const stored = await this.redis.get(key).catch(() => null);
    if (!stored) throw new UnauthorizedException('Refresh session expired');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, householdId: true, email: true },
    });
    if (!user) {
      await this.redis.del(key).catch(() => undefined);
      throw new UnauthorizedException('Refresh session expired');
    }

    await this.redis.del(key).catch(() => undefined);
    return this.issueTokens(user.id, user.householdId, user.email);
  }

  async logout(dto: RefreshDto) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ?: string }>(
        dto.refreshToken,
        { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET') },
      );
      if (payload.typ === 'refresh') {
        await this.redis.del(this.refreshKey(payload.sub, dto.refreshToken)).catch(() => undefined);
      }
    } catch {
      // Idempotent — already expired tokens are fine
    }
    return { ok: true };
  }

  /** Revoke every refresh session for the user (Settings → sign out everywhere). */
  async logoutAll(userId: string) {
    const sessionsRevoked = await this.revokeAllSessions(userId);
    return { ok: true, sessionsRevoked };
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        emailDigest: true,
        emailAlerts: true,
        householdId: true,
        household: { select: { id: true, name: true } },
        createdAt: true,
      },
    });
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.emailDigest !== undefined ? { emailDigest: dto.emailDigest } : {}),
        ...(dto.emailAlerts !== undefined ? { emailAlerts: dto.emailAlerts } : {}),
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        emailDigest: true,
        emailAlerts: true,
        householdId: true,
        household: { select: { id: true, name: true } },
        createdAt: true,
      },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Not authenticated');
    const ok = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    const revoked = await this.revokeAllSessions(userId);
    return { ok: true, sessionsRevoked: revoked };
  }

  /**
   * Always returns { ok: true } (no email enumeration).
   * When the account exists, stores a one-time Redis token and emails a reset link.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!user) return { ok: true as const };

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.resetTokenHash(token);
    const prevHash = await this.redis
      .get(this.resetUserKey(user.id))
      .catch(() => null);
    if (prevHash) {
      await this.redis.del(this.resetKey(prevHash)).catch(() => undefined);
    }
    await this.redis
      .set(this.resetKey(tokenHash), user.id, 'EX', RESET_TTL_SECONDS)
      .catch(() => undefined);
    await this.redis
      .set(this.resetUserKey(user.id), tokenHash, 'EX', RESET_TTL_SECONDS)
      .catch(() => undefined);

    const origin =
      this.config.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim() ||
      'http://localhost:5173';
    const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
    await this.notifications.sendPasswordReset({ to: user.email, resetUrl });
    return { ok: true as const };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.resetTokenHash(dto.token);
    const userId = await this.redis.get(this.resetKey(tokenHash)).catch(() => null);
    if (!userId) {
      throw new BadRequestException('Reset link is invalid or expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      await this.redis.del(this.resetKey(tokenHash)).catch(() => undefined);
      throw new BadRequestException('Reset link is invalid or expired');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.redis.del(this.resetKey(tokenHash)).catch(() => undefined);
    await this.redis.del(this.resetUserKey(userId)).catch(() => undefined);
    const sessionsRevoked = await this.revokeAllSessions(userId);
    return { ok: true as const, sessionsRevoked };
  }

  private resetTokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private resetKey(tokenHash: string) {
    return `password-reset:${tokenHash}`;
  }

  private resetUserKey(userId: string) {
    return `password-reset-user:${userId}`;
  }

  /** Delete all Redis refresh sessions for a user (password change / security). */
  async revokeAllSessions(userId: string): Promise<number> {
    const pattern = `session:refresh:${userId}:*`;
    try {
      const keys = await this.redis.keys(pattern);
      if (!keys.length) return 0;
      await this.redis.del(...keys);
      return keys.length;
    } catch {
      return 0;
    }
  }

  /** Issue a fresh access/refresh pair (invite accept, household leave). */
  issueSessionTokens(userId: string, householdId: string, email: string) {
    return this.issueTokens(userId, householdId, email);
  }

  private async issueTokens(userId: string, householdId: string, email: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, householdId, email },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '15m',
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, householdId, email, typ: 'refresh' },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
      },
    );

    const ttlSeconds = 30 * 24 * 60 * 60;
    await this.redis
      .set(this.refreshKey(userId, refreshToken), '1', 'EX', ttlSeconds)
      .catch(() => undefined);

    return {
      accessToken,
      refreshToken,
      user: { id: userId, householdId, email },
    };
  }

  private refreshKey(userId: string, token: string) {
    return `session:refresh:${userId}:${token.slice(-24)}`;
  }
}
