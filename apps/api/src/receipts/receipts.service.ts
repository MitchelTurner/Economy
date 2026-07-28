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
import { CatalogService } from '../catalog/catalog.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { receiptArithmeticOk, rankImplausibleLines } from '../common/money';
import {
  QUEUE_INSIGHTS_GENERATE,
  QUEUE_RECEIPT_EXTRACT,
  QUEUE_RECEIPT_MATCH,
  QUEUE_PRICE_OBSERVE,
} from '../jobs/queues';
import {
  AddLineDto,
  ConfirmReceiptDto,
  ManualReceiptDto,
  PatchLineDto,
  PatchReceiptDto,
  RegisterReceiptDto,
  UploadUrlDto,
} from './receipts.dto';

/** How long EXTRACTING may sit before cleanup/reextract treat it as stuck. */
export const STALE_EXTRACTING_MS = 5 * 60 * 1000;

export function isStaleExtracting(
  receipt: { status: ReceiptStatus; updatedAt: Date },
  now = Date.now(),
): boolean {
  return (
    receipt.status === ReceiptStatus.EXTRACTING &&
    now - receipt.updatedAt.getTime() >= STALE_EXTRACTING_MS
  );
}

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly catalog: CatalogService,
    @InjectQueue(QUEUE_RECEIPT_EXTRACT) private readonly extractQueue: Queue,
    @InjectQueue(QUEUE_RECEIPT_MATCH) private readonly matchQueue: Queue,
    @InjectQueue(QUEUE_PRICE_OBSERVE) private readonly observeQueue: Queue,
    @InjectQueue(QUEUE_INSIGHTS_GENERATE) private readonly insightsQueue: Queue,
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

    await this.matchQueue.add(
      'match',
      { receiptId: receipt.id },
      { attempts: 2, removeOnComplete: 100 },
    );

    return { receiptId: receipt.id };
  }

  async list(
    user: AuthUser,
    query: {
      from?: string;
      to?: string;
      storeId?: string;
      status?: ReceiptStatus;
      q?: string;
      cursor?: string;
      limit?: number;
    },
  ) {
    const limit = query.limit ?? 30;
    const q = query.q?.trim();
    const searchOr = buildReceiptSearchOr(q);
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
      ...(searchOr ? { OR: searchOr } : {}),
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

    const lines = await Promise.all(
      receipt.lines.map(async (line) => {
        const suggestions = line.productId
          ? []
          : await this.catalog.suggestionsForLine(line.rawText, receipt.storeId);
        return { ...line, suggestions };
      }),
    );

    const unmatchedCount = lines.filter((l) => !l.productId).length;

    const suspectLineNumbers = rankImplausibleLines(
      receipt.lines.map((l) => ({
        lineNumber: l.lineNumber,
        quantity: Number(l.quantity),
        unitPriceCents: l.unitPriceCents,
        extendedCents: l.extendedCents,
      })),
    ).slice(0, 5);

    // Prefer authenticated API image route so memory:// fallback still works
    const imageUrl = `/receipts/${receipt.id}/image`;
    const signedImageUrl = receipt.imageKey.startsWith('manual/')
      ? null
      : await this.storage.createDownloadUrl(receipt.imageKey);

    return {
      ...receipt,
      lines,
      unmatchedCount,
      suspectLineNumbers,
      imageUrl,
      signedImageUrl,
      runningTotalCents: arith.computedTotalCents,
      totalDeltaCents: arith.deltaCents,
      canConfirm: arith.ok || receipt.status === ReceiptStatus.FAILED,
    };
  }

  async getImage(user: AuthUser, id: string) {
    const receipt = await this.requireOwned(user, id);
    if (receipt.imageKey.startsWith('manual/')) {
      throw new NotFoundException('No image for manual receipt');
    }
    const buffer = await this.storage.getObjectBuffer(receipt.imageKey);
    const ext = receipt.imageKey.split('.').pop()?.toLowerCase();
    const contentType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/jpeg';
    return { buffer, contentType };
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

    let categoryId = dto.categoryId;
    if (dto.productId && categoryId === undefined) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
      });
      if (product) categoryId = product.categoryId;
    }

    const updated = await this.prisma.receiptLine.update({
      where: { id: lineId },
      data: {
        rawText: dto.rawText,
        quantity: dto.quantity,
        unitPriceCents: dto.unitPriceCents,
        extendedCents: dto.extendedCents,
        discountCents: dto.discountCents,
        categoryId,
        productId: dto.productId,
        ...(dto.productId
          ? { matchMethod: 'manual', matchConfidence: 1 }
          : {}),
      },
      include: { product: true, category: true },
    });

    // Alias learning — every manual bind teaches the next receipt
    if (dto.productId) {
      await this.catalog.upsertAlias(
        updated.rawText,
        dto.productId,
        receipt.storeId,
        'manual',
      );
    }

    return updated;
  }

  async addLine(user: AuthUser, receiptId: string, dto: AddLineDto) {
    await this.requireOwned(user, receiptId);
    const max = await this.prisma.receiptLine.aggregate({
      where: { receiptId },
      _max: { lineNumber: true },
    });
    const lineNumber = (max._max.lineNumber ?? 0) + 1;
    return this.prisma.receiptLine.create({
      data: {
        receiptId,
        lineNumber,
        rawText: dto.rawText,
        quantity: dto.quantity,
        unitPriceCents: dto.unitPriceCents ?? null,
        extendedCents: dto.extendedCents,
        discountCents: dto.discountCents ?? 0,
        categoryId: dto.categoryId ?? null,
      },
      include: { product: true, category: true },
    });
  }

  async deleteLine(user: AuthUser, receiptId: string, lineId: string) {
    await this.requireOwned(user, receiptId);
    const line = await this.prisma.receiptLine.findFirst({
      where: { id: lineId, receiptId },
    });
    if (!line) throw new NotFoundException('Line not found');
    await this.prisma.receiptLine.delete({ where: { id: lineId } });
    return { ok: true };
  }

  async sameAsLastTime(user: AuthUser, receiptId: string) {
    await this.requireOwned(user, receiptId);
    return this.catalog.applySameAsLastTime(user.householdId, receiptId);
  }

  async applyCategoryToSimilar(
    user: AuthUser,
    receiptId: string,
    lineId: string,
    categoryId: string,
  ) {
    await this.requireOwned(user, receiptId);
    return this.catalog.applyCategoryToSimilar(
      user.householdId,
      receiptId,
      lineId,
      categoryId,
    );
  }

  async rematch(user: AuthUser, receiptId: string) {
    await this.requireOwned(user, receiptId);
    return this.catalog.matchReceipt(receiptId);
  }

  /** Re-queue vision extraction for FAILED, UPLOADED, or stale EXTRACTING photo receipts. */
  async reextract(user: AuthUser, receiptId: string) {
    const receipt = await this.requireOwned(user, receiptId);
    if (receipt.imageKey.startsWith('manual/')) {
      throw new BadRequestException('Manual receipts cannot be re-extracted');
    }
    const retryable =
      receipt.status === ReceiptStatus.FAILED ||
      receipt.status === ReceiptStatus.UPLOADED ||
      isStaleExtracting(receipt);
    if (!retryable) {
      throw new BadRequestException(
        receipt.status === ReceiptStatus.EXTRACTING
          ? 'Extraction is still in progress — retry after a few minutes if it stays stuck'
          : `Only FAILED, UPLOADED, or stale EXTRACTING receipts can be re-extracted (got ${receipt.status})`,
      );
    }

    await this.prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: ReceiptStatus.UPLOADED,
        failureReason: null,
      },
    });

    await this.extractQueue.add(
      'extract',
      { receiptId },
      { attempts: 2, removeOnComplete: 100, removeOnFail: 50 },
    );

    return { ok: true as const, receiptId, status: ReceiptStatus.UPLOADED };
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
    await this.matchQueue.add(
      'match',
      { receiptId: id },
      { attempts: 2, removeOnComplete: 100 },
    );
    await this.insightsQueue.add(
      'household',
      { householdId: user.householdId },
      {
        jobId: `insights-${user.householdId}`,
        delay: 5_000,
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    );

    return updated;
  }

  async delete(user: AuthUser, id: string) {
    const receipt = await this.requireOwned(user, id);
    const lines = await this.prisma.receiptLine.findMany({
      where: { receiptId: id },
      select: { id: true },
    });
    const lineIds = lines.map((l) => l.id);
    if (lineIds.length) {
      await this.prisma.priceObservation.deleteMany({
        where: { receiptLineId: { in: lineIds } },
      });
    }
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

/** Build Prisma OR clauses for receipt text/total search (exported for unit tests). */
export function buildReceiptSearchOr(
  q: string | undefined,
): Prisma.ReceiptWhereInput[] | null {
  const term = q?.trim();
  if (!term) return null;
  const clauses: Prisma.ReceiptWhereInput[] = [
    { store: { name: { contains: term, mode: 'insensitive' } } },
    { lines: { some: { rawText: { contains: term, mode: 'insensitive' } } } },
    { paymentMethod: { contains: term, mode: 'insensitive' } },
  ];
  const dollars = Number(term.replace(/^\$/, ''));
  if (Number.isFinite(dollars) && /^\$?\d+(\.\d{1,2})?$/.test(term)) {
    const cents = Math.round(dollars * 100);
    clauses.push({ totalCents: cents });
  }
  return clauses;
}
