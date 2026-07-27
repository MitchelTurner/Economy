import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeRawText } from '../common/normalize';
import { CreateAliasDto, CreateProductDto } from './catalog.dto';

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

  async searchProducts(q?: string) {
    if (!q?.trim()) {
      return this.prisma.product.findMany({
        take: 50,
        include: { category: true },
        orderBy: { name: 'asc' },
      });
    }
    return this.prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
          { aliases: { some: { normalized: { contains: normalizeRawText(q) } } } },
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

    const normalized = normalizeRawText(dto.rawText);
    const storeId = dto.storeId ?? null;

    const existing = await this.prisma.productAlias.findFirst({
      where: { normalized, storeId },
    });
    if (existing) {
      return this.prisma.productAlias.update({
        where: { id: existing.id },
        data: { productId: dto.productId, hitCount: { increment: 1 }, source: 'manual' },
      });
    }

    return this.prisma.productAlias.create({
      data: {
        normalized,
        storeId,
        productId: dto.productId,
        source: 'manual',
      },
    });
  }

  /** Resolution order from SPEC §7 (Phase 1). */
  async matchRawText(rawText: string, storeId?: string | null) {
    const normalized = normalizeRawText(rawText);

    if (storeId) {
      const storeHit = await this.prisma.productAlias.findFirst({
        where: { normalized, storeId },
        include: { product: true },
      });
      if (storeHit) {
        return {
          productId: storeHit.productId,
          confidence: 1,
          method: 'alias' as const,
          suggestions: [],
        };
      }
    }

    const globalHit = await this.prisma.productAlias.findFirst({
      where: { normalized, storeId: null },
      include: { product: true },
    });
    if (globalHit) {
      return {
        productId: globalHit.productId,
        confidence: 0.9,
        method: 'alias' as const,
        suggestions: [],
      };
    }

    const suggestions = await this.prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: normalized.split(' ')[0] ?? normalized, mode: 'insensitive' } },
          { aliases: { some: { normalized: { contains: normalized.split(' ')[0] ?? '' } } } },
        ],
      },
      take: 5,
    });

    return {
      productId: null,
      confidence: 0,
      method: null,
      suggestions,
    };
  }
}
