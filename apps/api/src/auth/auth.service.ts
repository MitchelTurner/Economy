import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangePasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  UpdateMeDto,
} from './auth.dto';

@Injectable()
export class AuthService {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.redis = new Redis(this.config.get('REDIS_URL') ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
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

    await this.redis.del(key).catch(() => undefined);
    return this.issueTokens(payload.sub, payload.householdId, payload.email);
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
