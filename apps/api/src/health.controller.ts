import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Liveness — process is up. */
  @Get()
  ok() {
    return { ok: true, service: 'island-ledger-api' };
  }

  /** Readiness — DB + Redis respond. */
  @Get('ready')
  async ready() {
    const checks: Record<string, boolean> = { db: false, redis: false };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = true;
    } catch {
      checks.db = false;
    }

    const redis = new Redis(this.config.get('REDIS_URL') ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2000,
    });
    try {
      await redis.connect();
      const pong = await redis.ping();
      checks.redis = pong === 'PONG';
    } catch {
      checks.redis = false;
    } finally {
      redis.disconnect();
    }

    if (!checks.db || !checks.redis) {
      throw new ServiceUnavailableException({ ok: false, ...checks });
    }
    return { ok: true, service: 'island-ledger-api', ...checks };
  }
}
