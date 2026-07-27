import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma, ReceiptStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { receiptArithmeticOk } from '../common/money';
import { normalizeRawText } from '../common/normalize';
import { QUEUE_RECEIPT_EXTRACT, QUEUE_PRICE_OBSERVE } from '../jobs/queues';
import {
  ConfirmReceiptDto,
  ManualReceiptDto,
  PatchLineDto,
  PatchReceiptDto,
  RegisterReceiptDto,
  UploadUrlDto,
} from './receipts.dto';

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(QUEUE_RECEIPT_EXTRACT) private readonly extractQueue: Queue,
    @InjectQueue(QUEUE_PRICE_OBSERVE) private readonly observeQueue: Queue,
  ) {}

  async createUploadUrl(user: AuthUser, dto: UploadUrlDto) {
    const imageKey = this.storage.newImageKey(user.householdId, dto.extension);
    return this.storage.createUploadUrl(imageKey, dto.contentType);
  }

  async register(user: AuthUser, dto: RegisterReceiptDto) {
    if (!dto.imageKey.startsWith(`receipts/${user.householdId}/`)) {
      throw new BadRequestException('imageKey does not belong to this household');
    }

    const existing = await this.prisma.receipt.findUnique({
      where: {
        householdId_imageHash: {
          householdId: user.householdId,
          imageHash: dto.imageHash,
        },
      },
    });
    if (existing) {
      return { receiptId: existing.id, deduped: true, status: existing.status };
    }

    if (dto.imageBase64) {
      await this.storage.putObject(dto.imageKey, Buffer.from(dto.imageBase64, 'base64'));
    }

    const receipt = await this.prisma.receipt.create({
      data: {
        householdId: user.householdId,
        uploadedById: user.userId,
        imageKey: dto.imageKey,
        imageHash: dto.imageHash,
        status: ReceiptStatus.UPLOADED,
      },
    });

    await this.extractQueue.add(
      'extract',
      { receiptId: receipt.id },
      { attempts: 2, removeOnComplete: 100, removeOnFail: 50 },
    );

    return { receiptId: receipt.id, deduped: false, status: receipt.status };
  }

  /** Phase 0 manual entry — proves the model without vision. */
  async createManual(user: AuthUser, dto: ManualReceiptDto) {
    const categories = await this.prisma.category.findMany();
    const bySlug = new Map(categories.map((c) => [c.slug, c.id]));

    let storeId: string | null = null;
    if (dto.storeName) {
      const store = await this.prisma.store.upsert({
        where: {
          name_address: { name: dto.storeName, address: 'manual' },
        },
        update: {},
        create: {
          name: dto.storeName,
          address: 'manual',
          region: 'ketchikan',
        },
      });
      storeId = store.id;
    }

    const placeholderHash = `manual:${user.householdId}:${Date.now()}:${Math.random()}`;
    const receipt = await this.prisma.receipt.create({
      data: {
        householdId: user.householdId,
        uploadedById: user.userId,
        storeId,
        imageKey: `manual/${user.householdId}/${Date.now()}`,
        imageHash: placeholderHash,
        status: ReceiptStatus.NEEDS_REVIEW,
        purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : new Date(),
        taxCents: dto.taxCents,
        totalCents: dto.totalCents,
        paymentMethod: dto.paymentMethod,
        arithmeticOk: true,
        lines: {
          create: dto.lines.map((l, i) => ({
            lineNumber: i + 1,
            rawText: l.rawText,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents ?? null,
            extendedCents: l.extendedCents,
            discountCents: l.discountCents,
            categoryId: l.categorySlug ? bySlug.get(l.categorySlug) ?? null : null,
          })),
        },
      },
    });

    return { receiptId: receipt.id };
  }

  async list(
    user: AuthUser,
    query: {
      from?: string;
      to?: string;
      storeId?: string;
      status?: ReceiptStatus;
      cursor?: string;
      limit?: number;
    },
  ) {
    const limit = query.limit ?? 30;
    const where: Prisma.ReceiptWhereInput = {
      householdId: user.householdId,
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            purchasedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const items = await this.prisma.receipt.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ purchasedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        store: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    });

    const nextCursor = items.length > limit ? items[limit - 1]?.id : null;
    return { items: items.slice(0, limit), nextCursor };
  }

  async get(user: AuthUser, id: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id, householdId: user.householdId },
      include: {
        store: true,
        lines: {
          orderBy: { lineNumber: 'asc' },
          include: {
            category: true,
            product: true,
          },
        },
      },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');

    const arith = receiptArithmeticOk({
      lines: receipt.lines,
      taxCents: receipt.taxCents,
      totalCents: receipt.totalCents,
    });

    return {
      ...receipt,
      runningTotalCents: arith.computedTotalCents,
      totalDeltaCents: arith.deltaCents,
      canConfirm: arith.ok || receipt.status === ReceiptStatus.FAILED,
    };
  }

  async patch(user: AuthUser, id: string, dto: PatchReceiptDto) {
    await this.requireOwned(user, id);
    return this.prisma.receipt.update({
      where: { id },
      data: {
        storeId: dto.storeId,
        purchasedAt:
          dto.purchasedAt === undefined
            ? undefined
            : dto.purchasedAt
              ? new Date(dto.purchasedAt)
              : null,
        subtotalCents: dto.subtotalCents,
        taxCents: dto.taxCents,
        totalCents: dto.totalCents,
        paymentMethod: dto.paymentMethod,
      },
    });
  }

  async patchLine(user: AuthUser, receiptId: string, lineId: string, dto: PatchLineDto) {
    const receipt = await this.requireOwned(user, receiptId);
    const line = await this.prisma.receiptLine.findFirst({
      where: { id: lineId, receiptId },
    });
    if (!line) throw new NotFoundException('Line not found');

    const updated = await this.prisma.receiptLine.update({
      where: { id: lineId },
      data: {
        rawText: dto.rawText,
        quantity: dto.quantity,
        unitPriceCents: dto.unitPriceCents,
        extendedCents: dto.extendedCents,
        discountCents: dto.discountCents,
        categoryId: dto.categoryId,
        productId: dto.productId,
        ...(dto.productId
          ? { matchMethod: 'manual', matchConfidence: 1 }
          : {}),
      },
    });

    // Alias learning on manual product bind (Phase 1 path; safe in Phase 0)
    if (dto.productId) {
      const normalized = normalizeRawText(updated.rawText);
      const existing = await this.prisma.productAlias.findFirst({
        where: { normalized, storeId: receipt.storeId },
      });
      if (existing) {
        await this.prisma.productAlias.update({
          where: { id: existing.id },
          data: {
            productId: dto.productId,
            hitCount: { increment: 1 },
            source: 'manual',
          },
        });
      } else {
        await this.prisma.productAlias.create({
          data: {
            normalized,
            storeId: receipt.storeId,
            productId: dto.productId,
            source: 'manual',
          },
        });
      }
    }

    return updated;
  }

  async confirm(user: AuthUser, id: string, dto: ConfirmReceiptDto) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id, householdId: user.householdId },
      include: { lines: true },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');

    const arith = receiptArithmeticOk({
      lines: receipt.lines,
      taxCents: receipt.taxCents,
      totalCents: receipt.totalCents,
    });

    if (!arith.ok && !dto.overrideArithmetic) {
      throw new BadRequestException({
        message: 'Totals do not reconcile',
        computedTotalCents: arith.computedTotalCents,
        printedTotalCents: receipt.totalCents,
        deltaCents: arith.deltaCents,
      });
    }

    const updated = await this.prisma.receipt.update({
      where: { id },
      data: {
        status: ReceiptStatus.CONFIRMED,
        reviewedAt: new Date(),
        arithmeticOk: arith.ok,
      },
      include: { lines: true, store: true },
    });

    await this.observeQueue.add(
      'observe',
      { receiptId: id },
      { attempts: 2, removeOnComplete: 100 },
    );

    return updated;
  }

  async delete(user: AuthUser, id: string) {
    const receipt = await this.requireOwned(user, id);
    await this.storage.deleteObject(receipt.imageKey);
    await this.prisma.receipt.delete({ where: { id } });
    return { ok: true };
  }

  private async requireOwned(user: AuthUser, id: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id, householdId: user.householdId },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    return receipt;
  }
}
