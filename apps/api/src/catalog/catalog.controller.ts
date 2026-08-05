import { Body, Controller, Get, NotFoundException, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { consumeRateLimit } from '../common/rate-limit';
import { AiCategorizeService } from './ai-categorize.service';
import { CatalogService } from './catalog.service';
import {
  CategorizeLinesDto,
  CategorizeReceiptDto,
  CreateAliasDto,
  CreateProductDto,
  CreateStoreDto,
} from './catalog.dto';

function householdLimit() {
  return {
    name: 'household',
    limit: Number(process.env.RATE_LIMIT_HOUSEHOLD ?? 20),
    windowMs: 60_000,
  };
}

@Controller('catalog')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly aiCategorize: AiCategorizeService,
  ) {}

  @Get('categories')
  categories() {
    return this.catalog.listCategories();
  }

  @Get('stores')
  stores(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.catalog.listStores(user.householdId, q);
  }

  @Post('stores')
  async createStore(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStoreDto,
  ) {
    await consumeRateLimit(`${user.userId}:${user.householdId}`, {
      ...householdLimit(),
      name: 'catalog:stores',
    });
    return this.catalog.createStore(dto);
  }

  @Get('products')
  products(@Query('q') q?: string) {
    return this.catalog.searchProducts(q);
  }

  @Get('match')
  match(@Query('rawText') rawText: string, @Query('storeId') storeId?: string) {
    return this.catalog.matchRawText(rawText ?? '', storeId);
  }

  @Post('products')
  async createProduct(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProductDto,
  ) {
    await consumeRateLimit(`${user.userId}:${user.householdId}`, {
      ...householdLimit(),
      name: 'catalog:products',
    });
    return this.catalog.createProduct(dto);
  }

  @Post('aliases')
  async createAlias(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAliasDto,
  ) {
    await consumeRateLimit(`${user.userId}:${user.householdId}`, {
      ...householdLimit(),
      name: 'catalog:aliases',
    });
    return this.catalog.createAlias(dto);
  }

  /** Suggest categories for raw line texts (AI; taxonomy-constrained). */
  @Post('categorize')
  async categorize(
    @CurrentUser() user: AuthUser,
    @Body() dto: CategorizeLinesDto,
  ) {
    await consumeRateLimit(`${user.userId}:${user.householdId}`, {
      ...householdLimit(),
      name: 'catalog:categorize',
    });
    const suggestions = await this.aiCategorize.suggestWithIds(dto.rawTexts);
    return {
      enabled: this.aiCategorize.isEnabled(),
      suggestions,
    };
  }

  /** AI-fill uncategorized lines on a household receipt. */
  @Post('categorize-receipt')
  async categorizeReceipt(
    @CurrentUser() user: AuthUser,
    @Body() dto: CategorizeReceiptDto,
  ) {
    await consumeRateLimit(`${user.userId}:${user.householdId}`, {
      ...householdLimit(),
      name: 'catalog:categorize-receipt',
    });
    const receipt = await this.catalog.findHouseholdReceipt(
      user.householdId,
      dto.receiptId,
    );
    if (!receipt) throw new NotFoundException('Receipt not found');
    const result = await this.aiCategorize.fillUncategorizedLines(dto.receiptId);
    return { enabled: this.aiCategorize.isEnabled(), ...result };
  }
}
