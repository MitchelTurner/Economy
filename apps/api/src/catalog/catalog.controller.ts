import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { CatalogService } from './catalog.service';
import { CreateAliasDto, CreateProductDto, CreateStoreDto } from './catalog.dto';

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
  createStore(@Body() dto: CreateStoreDto) {
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
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalog.createProduct(dto);
  }

  @Post('aliases')
  createAlias(@Body() dto: CreateAliasDto) {
    return this.catalog.createAlias(dto);
  }
}
