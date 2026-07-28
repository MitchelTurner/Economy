import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeRawText } from '../common/normalize';
import { CreateAliasDto, CreateProductDto, CreateStoreDto } from './catalog.dto';
import {
  extractGtin,
  MatchCandidate,
  MatchResult,
  pickFuzzyMatch,
} from './matching';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      orderBy: { name: 'asc' },
      include: { children: { orderBy: { name: 'asc' } } },
    });
  }

  /**
   * Stores the household has shopped at, plus any other known island stores.
   * Prefer recent household receipts when ranking.
   */
  async listStores(householdId: string, q?: string) {
    const recent = await this.prisma.receipt.findMany({
      where: {
        householdId,
        storeId: { not: null },
      },
      distinct: ['storeId'],
      orderBy: { purchasedAt: 'desc' },
      take: 40,
      select: { storeId: true },
    });
    const recentIds = recent.map((r) => r.storeId!).filter(Boolean);

    const where = q?.trim()
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { address: { contains: q, mode: 'insensitive' as const } },
            { chain: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const stores = await this.prisma.store.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 80,
    });

    const rank = new Map(recentIds.map((id, i) => [id, i]));
    return stores.sort((a, b) => {
      const ar = rank.has(a.id) ? rank.get(a.id)! : 999;
      const br = rank.has(b.id) ? rank.get(b.id)! : 999;
      if (ar !== br) return ar - br;
      return a.name.localeCompare(b.name);
    });
  }

  async createStore(dto: CreateStoreDto) {
    const address = dto.address?.trim() || 'unknown';
    return this.prisma.store.upsert({
      where: {
        name_address: { name: dto.name.trim(), address },
      },
      update: {
        region: dto.region,
        chain: dto.chain,
      },
      create: {
        name: dto.name.trim(),
        address,
        region: dto.region || 'ketchikan',
        chain: dto.chain,
        aliases: {
          create: {
            raw: dto.name.trim().toUpperCase().replace(/\s+/g, ' '),
          },
        },
      },
    });
  }

  async searchProducts(q?: string) {
    if (!q?.trim()) {
      return this.prisma.product.findMany({
        take: 50,
        include: { category: true },
        orderBy: { name: 'asc' },
      });
    }
    const normalized = normalizeRawText(q);
    return this.prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
          { aliases: { some: { normalized: { contains: normalized } } } },
          { gtin: q.replace(/\D/g, '') || undefined },
        ],
      },
      take: 40,
      include: { category: true },
    });
  }

  createProduct(dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        name: dto.name,
        brand: dto.brand,
        gtin: dto.gtin,
        sizeValue: dto.sizeValue,
        sizeUom: dto.sizeUom,
        baseUom: dto.baseUom,
        baseFactor: dto.baseFactor,
        isStoreBrand: dto.isStoreBrand ?? false,
        categoryId: dto.categoryId,
      },
    });
  }

  async createAlias(dto: CreateAliasDto) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');
    return this.upsertAlias(dto.rawText, dto.productId, dto.storeId ?? null, 'manual');
  }

  async upsertAlias(
    rawText: string,
    productId: string,
    storeId: string | null,
    source: string,
  ) {
    const normalized = normalizeRawText(rawText);
    const existing = await this.prisma.productAlias.findFirst({
      where: { normalized, storeId },
    });
    if (existing) {
      return this.prisma.productAlias.update({
        where: { id: existing.id },
        data: { productId, hitCount: { increment: 1 }, source },
      });
    }
    return this.prisma.productAlias.create({
      data: { normalized, storeId, productId, source },
    });
  }

  /** Resolution order from SPEC §7. */
  async matchRawText(rawText: string, storeId?: string | null): Promise<MatchResult> {
    const normalized = normalizeRawText(rawText);

    if (storeId) {
      const storeHit = await this.prisma.productAlias.findFirst({
        where: { normalized, storeId },
        include: { product: true },
      });
      if (storeHit) {
        await this.prisma.productAlias.update({
          where: { id: storeHit.id },
          data: { hitCount: { increment: 1 } },
        });
        return {
          productId: storeHit.productId,
          confidence: 1,
          method: 'alias',
          suggestions: [],
          normalized,
        };
      }
    }

    const globalHit = await this.prisma.productAlias.findFirst({
      where: { normalized, storeId: null },
      include: { product: true },
    });
    if (globalHit) {
      await this.prisma.productAlias.update({
        where: { id: globalHit.id },
        data: { hitCount: { increment: 1 } },
      });
      return {
        productId: globalHit.productId,
        confidence: 0.9,
        method: 'alias',
        suggestions: [],
        normalized,
      };
    }

    const gtin = extractGtin(rawText);
    if (gtin) {
      const byGtin = await this.prisma.product.findUnique({ where: { gtin } });
      if (byGtin) {
        return {
          productId: byGtin.id,
          confidence: 1,
          method: 'gtin',
          suggestions: [],
          normalized,
        };
      }
    }

    const tokens = normalized.split(' ').filter((t) => t.length > 2).slice(0, 4);
    const products = await this.prisma.product.findMany({
      where:
        tokens.length > 0
          ? {
              OR: tokens.flatMap((t) => [
                { name: { contains: t, mode: 'insensitive' as const } },
                { aliases: { some: { normalized: { contains: t } } } },
              ]),
            }
          : undefined,
      take: 80,
      include: { aliases: { take: 5 } },
    });

    const pool =
      products.length > 0
        ? products
        : await this.prisma.product.findMany({ take: 80, include: { aliases: { take: 5 } } });

    const candidates = pool.flatMap((p) => {
      const base = {
        productId: p.id,
        name: p.name,
        brand: p.brand,
        sizeValue: p.sizeValue ? Number(p.sizeValue) : null,
        sizeUom: p.sizeUom,
      };
      if (p.aliases.length === 0) return [base];
      return p.aliases.map((a) => ({ ...base, aliasNormalized: a.normalized }));
    });

    return pickFuzzyMatch(normalized, candidates);
  }

  async matchReceipt(receiptId: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: { lines: true },
    });
    if (!receipt) return { matched: 0, unmatched: 0 };

    let matched = 0;
    let unmatched = 0;

    for (const line of receipt.lines) {
      if (line.productId && line.matchMethod === 'manual') {
        matched += 1;
        continue;
      }

      const result = await this.matchRawText(line.rawText, receipt.storeId);
      if (result.productId) {
        const product = await this.prisma.product.findUnique({
          where: { id: result.productId },
        });
        await this.prisma.receiptLine.update({
          where: { id: line.id },
          data: {
            productId: result.productId,
            matchConfidence: result.confidence,
            matchMethod: result.method,
            categoryId: line.categoryId ?? product?.categoryId ?? null,
          },
        });
        matched += 1;
      } else {
        unmatched += 1;
      }
    }

    return { matched, unmatched };
  }

  async suggestionsForLine(rawText: string, storeId?: string | null): Promise<MatchCandidate[]> {
    const result = await this.matchRawText(rawText, storeId);
    if (result.productId && result.suggestions.length === 0) {
      const product = await this.prisma.product.findUnique({
        where: { id: result.productId },
      });
      if (product) {
        return [
          {
            productId: product.id,
            name: product.name,
            score: result.confidence,
            brand: product.brand,
            sizeLabel:
              product.sizeValue != null && product.sizeUom
                ? `${product.sizeValue} ${product.sizeUom}`
                : null,
          },
        ];
      }
    }
    return result.suggestions;
  }

  /** Re-apply product bindings from the household's last confirmed trip at this store. */
  async applySameAsLastTime(householdId: string, receiptId: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id: receiptId, householdId },
      include: { lines: true },
    });
    if (!receipt?.storeId) {
      return { applied: 0, reason: 'no_store' as const };
    }

    const prior = await this.prisma.receipt.findFirst({
      where: {
        householdId,
        storeId: receipt.storeId,
        status: 'CONFIRMED',
        id: { not: receiptId },
      },
      orderBy: { purchasedAt: 'desc' },
      include: { lines: { where: { productId: { not: null } } } },
    });
    if (!prior) {
      return { applied: 0, reason: 'no_prior' as const };
    }

    const byNorm = new Map(
      prior.lines.map((l) => [normalizeRawText(l.rawText), l] as const),
    );

    let applied = 0;
    for (const line of receipt.lines) {
      if (line.productId) continue;
      const prev = byNorm.get(normalizeRawText(line.rawText));
      if (!prev?.productId) continue;
      await this.prisma.receiptLine.update({
        where: { id: line.id },
        data: {
          productId: prev.productId,
          categoryId: line.categoryId ?? prev.categoryId,
          matchMethod: 'alias',
          matchConfidence: 1,
        },
      });
      await this.upsertAlias(line.rawText, prev.productId, receipt.storeId, 'manual');
      applied += 1;
    }
    return {
      applied,
      reason: (applied === 0 ? 'none_matched' : 'ok') as
        | 'ok'
        | 'none_matched'
        | 'no_store'
        | 'no_prior',
    };
  }

  async applyCategoryToSimilar(
    householdId: string,
    receiptId: string,
    lineId: string,
    categoryId: string,
  ) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id: receiptId, householdId },
      include: { lines: true },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    const source = receipt.lines.find((l) => l.id === lineId);
    if (!source) throw new NotFoundException('Line not found');

    const sourceTokens = significantTokens(source.rawText);
    let updated = 0;
    for (const line of receipt.lines) {
      if (!linesShareCategoryHint(sourceTokens, line.rawText)) continue;
      await this.prisma.receiptLine.update({
        where: { id: line.id },
        data: { categoryId },
      });
      updated += 1;
    }
    return { updated };
  }
}

/** Tokens ≥3 chars used to decide "similar" lines for bulk category apply. */
export function significantTokens(raw: string): string[] {
  return normalizeRawText(raw)
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

/** Match when lines share the first significant token, or ≥2 overlapping tokens. */
export function linesShareCategoryHint(
  sourceTokens: string[],
  otherRaw: string,
): boolean {
  if (!sourceTokens.length) return false;
  const other = significantTokens(otherRaw);
  if (!other.length) return false;
  if (sourceTokens[0] === other[0]) return true;
  const overlap = sourceTokens.filter((t) => other.includes(t)).length;
  return overlap >= 2;
}
