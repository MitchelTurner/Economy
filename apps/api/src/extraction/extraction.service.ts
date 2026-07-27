import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReceiptStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ExtractionProvider } from './extraction.provider';
import { ExtractionResultSchema } from './extraction.schema';
import { receiptArithmeticOk, rankImplausibleLines } from '../common/money';

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly provider: ExtractionProvider,
    private readonly config: ConfigService,
  ) {}

  async processReceipt(receiptId: string) {
    const receipt = await this.prisma.receipt.findUnique({ where: { id: receiptId } });
    if (!receipt) {
      this.logger.warn(`Receipt ${receiptId} not found`);
      return;
    }

    const maxPerDay = Number(this.config.get('MAX_EXTRACTIONS_PER_DAY') ?? 50);
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const usageCount = await this.prisma.extractionUsage.count({
      where: { householdId: receipt.householdId, createdAt: { gte: dayStart } },
    });
    if (usageCount >= maxPerDay) {
      await this.prisma.receipt.update({
        where: { id: receiptId },
        data: {
          status: ReceiptStatus.FAILED,
          failureReason: `Daily extraction cap (${maxPerDay}) reached`,
        },
      });
      return;
    }

    await this.prisma.receipt.update({
      where: { id: receiptId },
      data: { status: ReceiptStatus.EXTRACTING, failureReason: null },
    });

    let imageBytes: Buffer;
    try {
      imageBytes = await this.storage.getObjectBuffer(receipt.imageKey);
    } catch (err) {
      await this.prisma.receipt.update({
        where: { id: receiptId },
        data: {
          status: ReceiptStatus.FAILED,
          failureReason: `Could not load image: ${(err as Error).message}`,
        },
      });
      return;
    }

    let call = await this.provider.extract(imageBytes);
    let parsed = ExtractionResultSchema.safeParse(call.result);
    if (!parsed.success) {
      await this.fail(receiptId, 'Extraction JSON failed schema validation', call);
      return;
    }

    let arith = receiptArithmeticOk({
      lines: parsed.data.lines,
      taxCents: parsed.data.taxCents,
      totalCents: parsed.data.totalCents,
    });

    if (!arith.ok) {
      const hint = `computed ${arith.computedTotalCents} vs printed ${parsed.data.totalCents} (delta ${arith.deltaCents})`;
      this.logger.log(`Arithmetic retry for ${receiptId}: ${hint}`);
      call = await this.provider.extract(imageBytes, 'image/jpeg', hint);
      parsed = ExtractionResultSchema.safeParse(call.result);
      if (!parsed.success) {
        await this.fail(receiptId, 'Retry extraction failed schema validation', call);
        return;
      }
      arith = receiptArithmeticOk({
        lines: parsed.data.lines,
        taxCents: parsed.data.taxCents,
        totalCents: parsed.data.totalCents,
      });
    }

    await this.prisma.extractionUsage.create({
      data: {
        householdId: receipt.householdId,
        receiptId,
        model: call.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
      },
    });

    if (!arith.ok) {
      const implausible = rankImplausibleLines(
        parsed.data.lines.map((l) => ({
          lineNumber: l.lineNumber,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          extendedCents: l.extendedCents,
        })),
      );
      await this.prisma.receipt.update({
        where: { id: receiptId },
        data: {
          status: ReceiptStatus.FAILED,
          failureReason: `Arithmetic check failed after retry (delta ${arith.deltaCents}¢). Suspect lines: ${implausible.slice(0, 3).join(', ')}`,
          rawExtraction: parsed.data,
          extractionModel: call.model,
          confidence: parsed.data.confidence,
          arithmeticOk: false,
          tokenUsage: { input: call.inputTokens, output: call.outputTokens },
          subtotalCents: parsed.data.subtotalCents,
          taxCents: parsed.data.taxCents,
          totalCents: parsed.data.totalCents,
          paymentMethod: parsed.data.paymentMethod,
          purchasedAt: parsed.data.purchasedAt ? new Date(parsed.data.purchasedAt) : null,
        },
      });
      // Still persist lines so user can manually fix
      await this.replaceLines(receiptId, parsed.data);
      return;
    }

    const storeId = await this.resolveStore(
      parsed.data.store.name,
      parsed.data.store.address,
    );

    await this.prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: ReceiptStatus.NEEDS_REVIEW,
        storeId,
        purchasedAt: parsed.data.purchasedAt ? new Date(parsed.data.purchasedAt) : null,
        subtotalCents: parsed.data.subtotalCents,
        taxCents: parsed.data.taxCents,
        totalCents: parsed.data.totalCents,
        paymentMethod: parsed.data.paymentMethod,
        rawExtraction: parsed.data,
        extractionModel: call.model,
        confidence: parsed.data.confidence,
        arithmeticOk: true,
        failureReason: null,
        tokenUsage: { input: call.inputTokens, output: call.outputTokens },
      },
    });

    await this.replaceLines(receiptId, parsed.data);
  }

  private async replaceLines(
    receiptId: string,
    data: {
      lines: Array<{
        lineNumber: number;
        rawText: string;
        quantity: number;
        unitPriceCents: number | null;
        extendedCents: number;
        discountCents: number;
        isTaxable: boolean;
        isRefund: boolean;
        guessedCategory: string | null;
      }>;
    },
  ) {
    await this.prisma.receiptLine.deleteMany({ where: { receiptId } });

    const categories = await this.prisma.category.findMany();
    const bySlug = new Map(categories.map((c) => [c.slug, c.id]));
    const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

    await this.prisma.receiptLine.createMany({
      data: data.lines.map((l) => {
        const guess = l.guessedCategory?.toLowerCase() ?? null;
        const categoryId = guess
          ? (bySlug.get(guess) ?? byName.get(guess) ?? null)
          : null;
        return {
          receiptId,
          lineNumber: l.lineNumber,
          rawText: l.rawText,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          extendedCents: l.extendedCents,
          discountCents: l.discountCents,
          isTaxable: l.isTaxable,
          isRefund: l.isRefund,
          categoryId,
        };
      }),
    });
  }

  private async resolveStore(name: string | null, address: string | null) {
    if (!name) return null;
    const aliasKey = name.toUpperCase().replace(/\s+/g, ' ').trim();
    const alias = await this.prisma.storeAlias.findUnique({ where: { raw: aliasKey } });
    if (alias) return alias.storeId;

    const existing = await this.prisma.store.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(address ? { address: { equals: address, mode: 'insensitive' } } : {}),
      },
    });
    if (existing) {
      await this.prisma.storeAlias.upsert({
        where: { raw: aliasKey },
        update: {},
        create: { raw: aliasKey, storeId: existing.id },
      });
      return existing.id;
    }

    const created = await this.prisma.store.create({
      data: {
        name,
        address: address ?? undefined,
        region: 'ketchikan',
        aliases: { create: { raw: aliasKey } },
      },
    });
    return created.id;
  }

  private async fail(
    receiptId: string,
    reason: string,
    call?: { model: string; inputTokens: number; outputTokens: number },
  ) {
    await this.prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: ReceiptStatus.FAILED,
        failureReason: reason,
        extractionModel: call?.model,
        tokenUsage: call
          ? { input: call.inputTokens, output: call.outputTokens }
          : undefined,
      },
    });
  }
}
