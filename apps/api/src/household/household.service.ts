import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { AcceptInviteDto, InviteDto } from './household.dto';

@Injectable()
export class HouseholdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async members(user: AuthUser) {
    const household = await this.prisma.household.findUnique({
      where: { id: user.householdId },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            createdAt: true,
          },
        },
        invites: {
          where: { acceptedAt: null, expiresAt: { gt: new Date() } },
          select: {
            id: true,
            email: true,
            expiresAt: true,
            createdAt: true,
            // token intentionally omitted from members listing
          },
        },
      },
    });
    if (!household) throw new NotFoundException('Household not found');
    return household;
  }

  async invite(user: AuthUser, dto: InviteDto) {
    const me = await this.prisma.user.findUnique({ where: { id: user.userId } });
    if (!me) throw new NotFoundException();
    if (me.role !== 'owner' && me.role !== 'member') {
      throw new ForbiddenException();
    }

    const email = dto.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser?.householdId === user.householdId) {
      throw new BadRequestException('User already in this household');
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 7);

    const pending = await this.prisma.householdInvite.findFirst({
      where: {
        householdId: user.householdId,
        email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    const invite = pending
      ? await this.prisma.householdInvite.update({
          where: { id: pending.id },
          data: { token, expiresAt, invitedById: user.userId },
          include: { household: { select: { name: true } } },
        })
      : await this.prisma.householdInvite.create({
          data: {
            householdId: user.householdId,
            email,
            token,
            invitedById: user.userId,
            expiresAt,
          },
          include: { household: { select: { name: true } } },
        });

    const webOrigin =
      this.config.get('CORS_ORIGIN')?.split(',')[0]?.trim() ??
      'http://localhost:5173';
    const inviteUrl = `${webOrigin}/invite?token=${invite.token}`;
    await this.notifications.sendInvite({
      to: invite.email,
      householdName: invite.household.name,
      inviteUrl,
      invitedBy: me.displayName ?? me.email,
    });

    return {
      id: invite.id,
      email: invite.email,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      inviteUrl,
      token: invite.token,
    };
  }

  async peekInvite(token: string) {
    if (!token || token.length < 10) {
      throw new BadRequestException('Invalid invite token');
    }
    const invite = await this.prisma.householdInvite.findUnique({
      where: { token },
      include: { household: { select: { id: true, name: true } } },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException('Invite invalid or expired');
    }
    return {
      email: invite.email,
      expiresAt: invite.expiresAt,
      household: invite.household,
    };
  }

  async revokeInvite(user: AuthUser, id: string) {
    const invite = await this.prisma.householdInvite.findFirst({
      where: { id, householdId: user.householdId },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    await this.prisma.householdInvite.delete({ where: { id } });
    return { ok: true };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.prisma.householdInvite.findUnique({
      where: { token: dto.token },
      include: { household: true },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException('Invite invalid or expired');
    }

    const email = invite.email;
    let user = await this.prisma.user.findUnique({
      where: { email },
      include: { household: { select: { id: true, name: true } } },
    });
    const passwordHash = await argon2.hash(dto.password);

    if (user && user.householdId !== invite.householdId) {
      const [memberCount, receiptCount] = await Promise.all([
        this.prisma.user.count({ where: { householdId: user.householdId } }),
        this.prisma.receipt.count({ where: { householdId: user.householdId } }),
      ]);
      const hasOtherLife = memberCount > 1 || receiptCount > 0;
      if (hasOtherLife && !dto.moveHousehold) {
        throw new BadRequestException({
          code: 'ALREADY_IN_HOUSEHOLD',
          message:
            'You already belong to another household. Confirm moveHousehold to leave it.',
          currentHouseholdName: user.household.name,
          inviteHouseholdName: invite.household.name,
        });
      }
    }

    if (user) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          householdId: invite.householdId,
          passwordHash,
          displayName: dto.displayName ?? user.displayName,
          role: 'member',
        },
        include: { household: { select: { id: true, name: true } } },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName: dto.displayName,
          householdId: invite.householdId,
          role: 'member',
        },
        include: { household: { select: { id: true, name: true } } },
      });
    }

    await this.prisma.householdInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    return {
      household: { id: invite.householdId, name: invite.household.name },
      user: { id: user.id, email: user.email, householdId: user.householdId },
    };
  }

  async exportData(user: AuthUser) {
    const householdId = user.householdId;
    const [household, receipts, budgets, insights, observations, alerts] =
      await Promise.all([
        this.prisma.household.findUnique({
          where: { id: householdId },
          include: {
            users: {
              select: { id: true, email: true, displayName: true, role: true },
            },
          },
        }),
        this.prisma.receipt.findMany({
          where: { householdId },
          include: { lines: true, store: true },
        }),
        this.prisma.budget.findMany({ where: { householdId } }),
        this.prisma.insight.findMany({ where: { householdId } }),
        this.prisma.priceObservation.findMany({ where: { householdId } }),
        this.prisma.priceAlert.findMany({ where: { householdId } }),
      ]);

    const json = {
      exportedAt: new Date().toISOString(),
      household,
      receipts,
      budgets,
      insights,
      priceObservations: observations,
      alerts,
    };

    const csvLines = [
      'receiptId,purchasedAt,store,rawText,quantity,extendedCents,categoryId,productId',
    ];
    for (const r of receipts) {
      for (const l of r.lines) {
        csvLines.push(
          [
            r.id,
            r.purchasedAt?.toISOString() ?? '',
            JSON.stringify(r.store?.name ?? ''),
            JSON.stringify(l.rawText),
            l.quantity,
            l.extendedCents,
            l.categoryId ?? '',
            l.productId ?? '',
          ].join(','),
        );
      }
    }

    return { json, csv: csvLines.join('\n') };
  }

  async usage(user: AuthUser) {
    const maxPerDay = Number(this.config.get('MAX_EXTRACTIONS_PER_DAY') ?? 50);
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [todayCount, weekRows] = await Promise.all([
      this.prisma.extractionUsage.count({
        where: { householdId: user.householdId, createdAt: { gte: dayStart } },
      }),
      this.prisma.extractionUsage.findMany({
        where: { householdId: user.householdId, createdAt: { gte: weekStart } },
        select: { inputTokens: true, outputTokens: true, model: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    const weekInputTokens = weekRows.reduce((s, r) => s + r.inputTokens, 0);
    const weekOutputTokens = weekRows.reduce((s, r) => s + r.outputTokens, 0);

    return {
      maxExtractionsPerDay: maxPerDay,
      extractionsToday: todayCount,
      remainingToday: Math.max(0, maxPerDay - todayCount),
      week: {
        extractions: weekRows.length,
        inputTokens: weekInputTokens,
        outputTokens: weekOutputTokens,
      },
    };
  }

  async hardDelete(user: AuthUser) {
    const me = await this.prisma.user.findUnique({ where: { id: user.userId } });
    if (!me || me.role !== 'owner') {
      throw new ForbiddenException('Only the household owner can delete all data');
    }

    const householdId = user.householdId;
    const receipts = await this.prisma.receipt.findMany({
      where: { householdId },
      select: { imageKey: true },
    });
    for (const r of receipts) {
      await this.storage.deleteObject(r.imageKey);
    }

    // Cascade-friendly delete order
    await this.prisma.priceObservation.deleteMany({ where: { householdId } });
    await this.prisma.priceAlert.deleteMany({ where: { householdId } });
    await this.prisma.insight.deleteMany({ where: { householdId } });
    await this.prisma.budget.deleteMany({ where: { householdId } });
    await this.prisma.receipt.deleteMany({ where: { householdId } });
    await this.prisma.householdInvite.deleteMany({ where: { householdId } });
    await this.prisma.extractionUsage.deleteMany({ where: { householdId } });
    await this.prisma.user.deleteMany({ where: { householdId } });
    await this.prisma.household.delete({ where: { id: householdId } });

    return { ok: true, deletedHouseholdId: householdId };
  }
}
