import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateAlertDto, PatchAlertDto } from './alerts.dto';

export type TriggeredAlert = {
  alertId: string;
  productId: string;
  productName: string;
  currentCents: number;
  reason: string;
};

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser) {
    return this.prisma.priceAlert.findMany({
      where: { householdId: user.householdId, userId: user.userId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(user: AuthUser, dto: CreateAlertDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.priceAlert.create({
      data: {
        userId: user.userId,
        householdId: user.householdId,
        productId: dto.productId,
        dropPct: dto.dropPct ?? null,
        targetCents: dto.targetCents ?? null,
      },
      include: { product: true },
    });
  }

  async patch(user: AuthUser, id: string, dto: PatchAlertDto) {
    const alert = await this.prisma.priceAlert.findFirst({
      where: { id, userId: user.userId },
    });
    if (!alert) throw new NotFoundException('Alert not found');
    return this.prisma.priceAlert.update({
      where: { id },
      data: {
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.dropPct !== undefined ? { dropPct: dto.dropPct } : {}),
        ...(dto.targetCents !== undefined ? { targetCents: dto.targetCents } : {}),
      },
      include: { product: true },
    });
  }

  async remove(user: AuthUser, id: string) {
    const alert = await this.prisma.priceAlert.findFirst({
      where: { id, userId: user.userId },
    });
    if (!alert) throw new NotFoundException('Alert not found');
    await this.prisma.priceAlert.delete({ where: { id } });
    return { ok: true };
  }

  /** Evaluate active alerts for a household after new observations. */
  async checkHousehold(householdId: string): Promise<TriggeredAlert[]> {
    const alerts = await this.prisma.priceAlert.findMany({
      where: { householdId, active: true },
      include: { product: true },
    });
    const triggered: TriggeredAlert[] = [];
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);

    for (const alert of alerts) {
      const latest = await this.prisma.priceObservation.findFirst({
        where: { householdId, productId: alert.productId },
        orderBy: { observedAt: 'desc' },
      });
      if (!latest) continue;

      const history = await this.prisma.priceObservation.findMany({
        where: {
          householdId,
          productId: alert.productId,
          observedAt: { gte: since },
        },
        select: { unitPriceCents: true },
      });
      const max = Math.max(...history.map((h) => h.unitPriceCents), latest.unitPriceCents);
      let fire = false;
      let reason = '';

      if (alert.targetCents != null && latest.unitPriceCents <= alert.targetCents) {
        fire = true;
        reason = `at or below target $${(alert.targetCents / 100).toFixed(2)}`;
      }
      if (alert.dropPct != null && max > 0) {
        const drop = ((max - latest.unitPriceCents) / max) * 100;
        if (drop >= alert.dropPct) {
          fire = true;
          reason = reason
            ? `${reason}; down ${drop.toFixed(0)}% from 30-day high`
            : `down ${drop.toFixed(0)}% from 30-day high`;
        }
      }

      if (!fire) continue;
      // Dedupe: don't re-trigger same day at same price
      if (
        alert.lastTriggeredAt &&
        alert.lastPriceCents === latest.unitPriceCents &&
        sameUtcDay(alert.lastTriggeredAt, new Date())
      ) {
        continue;
      }

      await this.prisma.priceAlert.update({
        where: { id: alert.id },
        data: {
          lastTriggeredAt: new Date(),
          lastPriceCents: latest.unitPriceCents,
        },
      });

      triggered.push({
        alertId: alert.id,
        productId: alert.productId,
        productName: alert.product.name,
        currentCents: latest.unitPriceCents,
        reason,
      });
    }

    return triggered;
  }
}

function sameUtcDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
