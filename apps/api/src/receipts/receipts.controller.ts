import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReceiptStatus } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ReceiptsService } from './receipts.service';
import {
  ConfirmReceiptDto,
  ManualReceiptDto,
  PatchLineDto,
  PatchReceiptDto,
  RegisterReceiptDto,
  UploadUrlDto,
} from './receipts.dto';

@Controller('receipts')
@UseGuards(JwtAuthGuard)
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Post('upload-url')
  uploadUrl(@CurrentUser() user: AuthUser, @Body() dto: UploadUrlDto) {
    return this.receipts.createUploadUrl(user, dto);
  }

  @Post()
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterReceiptDto) {
    return this.receipts.register(user, dto);
  }

  @Post('manual')
  manual(@CurrentUser() user: AuthUser, @Body() dto: ManualReceiptDto) {
    return this.receipts.createManual(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('storeId') storeId?: string,
    @Query('status') status?: ReceiptStatus,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.receipts.list(user, {
      from,
      to,
      storeId,
      status,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.receipts.get(user, id);
  }

  @Patch(':id')
  patch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PatchReceiptDto,
  ) {
    return this.receipts.patch(user, id, dto);
  }

  @Patch(':id/lines/:lineId')
  patchLine(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: PatchLineDto,
  ) {
    return this.receipts.patchLine(user, id, lineId, dto);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConfirmReceiptDto,
  ) {
    return this.receipts.confirm(user, id, dto);
  }

  @Post(':id/same-as-last')
  sameAsLast(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.receipts.sameAsLastTime(user, id);
  }

  @Post(':id/rematch')
  rematch(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.receipts.rematch(user, id);
  }

  @Post(':id/lines/:lineId/apply-category-similar')
  applyCategorySimilar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: { categoryId: string },
  ) {
    return this.receipts.applyCategoryToSimilar(
      user,
      id,
      lineId,
      body.categoryId,
    );
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.receipts.delete(user, id);
  }
}
