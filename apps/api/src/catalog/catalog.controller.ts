import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { consumeRateLimit } from '../common/rate-limit';
import { CatalogService } from './catalog.service';
import { CreateAliasDto, CreateProductDto, CreateStoreDto } from './catalog.dto';

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
  constructor(private readonly catalog: CatalogService) {}

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
}
