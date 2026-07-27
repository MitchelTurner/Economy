import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CatalogService } from './catalog.service';
import { CreateAliasDto, CreateProductDto } from './catalog.dto';

@Controller('catalog')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  categories() {
    return this.catalog.listCategories();
  }

  @Get('products')
  products(@Query('q') q?: string) {
    return this.catalog.searchProducts(q);
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
