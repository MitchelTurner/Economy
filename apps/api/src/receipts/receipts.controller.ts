import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import type { Request } from 'express';
import { ReceiptStatus } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { clientKeyFromReq, consumeRateLimit } from '../common/rate-limit';
import { ReceiptsService } from './receipts.service';
import {
  ConfirmReceiptDto,
  ManualReceiptDto,
  PatchLineDto,
  PatchReceiptDto,
  RegisterReceiptDto,
  UploadUrlDto,
  AddLineDto,
  ApplyCategorySimilarDto,
} from './receipts.dto';

function uploadLimit() {
  return {
    name: 'receipts:upload',
    limit: Number(process.env.RATE_LIMIT_UPLOAD ?? 60),
    windowMs: 60_000,
  };
}

@Controller('receipts')
@UseGuards(JwtAuthGuard)
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Post('upload-url')
  async uploadUrl(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadUrlDto,
  ) {
    await consumeRateLimit(clientKeyFromReq(req) + ':' + user.householdId, {
      ...uploadLimit(),
      name: 'receipts:upload-url',
    });
    return this.receipts.createUploadUrl(user, dto);
  }

  @Post()
  async register(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterReceiptDto,
  ) {
    await consumeRateLimit(clientKeyFromReq(req) + ':' + user.householdId, {
      ...uploadLimit(),
      name: 'receipts:register',
    });
    return this.receipts.register(user, dto);
  }

  @Post('manual')
  async manual(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Body() dto: ManualReceiptDto,
  ) {
    await consumeRateLimit(clientKeyFromReq(req) + ':' + user.householdId, {
      ...uploadLimit(),
      name: 'receipts:manual',
    });
    return this.receipts.createManual(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('storeId') storeId?: string,
    @Query('status') status?: ReceiptStatus,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.receipts.list(user, {
      from,
      to,
      storeId,
      status,
      q,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id/image')
  async image(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, contentType } = await this.receipts.getImage(user, id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.receipts.get(user, id);
  }

  @Patch(':id')
  async patch(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PatchReceiptDto,
  ) {
    await consumeRateLimit(clientKeyFromReq(req) + ':' + user.householdId, {
      ...uploadLimit(),
      name: 'receipts:patch',
    });
    return this.receipts.patch(user, id, dto);
  }

  @Post(':id/lines')
  async addLine(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddLineDto,
  ) {
    await consumeRateLimit(clientKeyFromReq(req) + ':' + user.householdId, {
      ...uploadLimit(),
      name: 'receipts:add-line',
    });
    return this.receipts.addLine(user, id, dto);
  }

  @Patch(':id/lines/:lineId')
  async patchLine(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: PatchLineDto,
  ) {
    await consumeRateLimit(clientKeyFromReq(req) + ':' + user.householdId, {
      ...uploadLimit(),
      name: 'receipts:patch-line',
    });
    return this.receipts.patchLine(user, id, lineId, dto);
  }

  @Delete(':id/lines/:lineId')
  async deleteLine(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ) {
    await consumeRateLimit(clientKeyFromReq(req) + ':' + user.householdId, {
      ...uploadLimit(),
      name: 'receipts:delete-line',
    });
    return this.receipts.deleteLine(user, id, lineId);
  }

  @Post(':id/confirm')
  async confirm(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConfirmReceiptDto,
  ) {
    await consumeRateLimit(clientKeyFromReq(req) + ':' + user.householdId, {
      ...uploadLimit(),
      name: 'receipts:confirm',
    });
    return this.receipts.confirm(user, id, dto);
  }

  @Post(':id/same-as-last')
  async sameAsLast(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    await consumeRateLimit(clientKeyFromReq(req) + ':' + user.householdId, {
      ...uploadLimit(),
      name: 'receipts:same-as-last',
    });
    return this.receipts.sameAsLastTime(user, id);
  }

  @Post(':id/rematch')
  async rematch(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    await consumeRateLimit(clientKeyFromReq(req) + ':' + user.householdId, {
      ...uploadLimit(),
      name: 'receipts:rematch',
    });
    return this.receipts.rematch(user, id);
  }

  @Post(':id/reextract')
  async reextract(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    await consumeRateLimit(clientKeyFromReq(req) + ':' + user.householdId, {
      ...uploadLimit(),
      name: 'receipts:reextract',
    });
    return this.receipts.reextract(user, id);
  }

  @Post(':id/reopen')
  async reopen(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    await consumeRateLimit(clientKeyFromReq(req) + ':' + user.householdId, {
      ...uploadLimit(),
      name: 'receipts:reopen',
    });
    return this.receipts.reopen(user, id);
  }

  @Post(':id/lines/:lineId/apply-category-similar')
  async applyCategorySimilar(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: ApplyCategorySimilarDto,
  ) {
    await consumeRateLimit(clientKeyFromReq(req) + ':' + user.householdId, {
      ...uploadLimit(),
      name: 'receipts:apply-category',
    });
    return this.receipts.applyCategoryToSimilar(
      user,
      id,
      lineId,
      body.categoryId,
    );
  }

  @Delete(':id')
  async delete(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    await consumeRateLimit(clientKeyFromReq(req) + ':' + user.householdId, {
      ...uploadLimit(),
      name: 'receipts:delete',
    });
    return this.receipts.delete(user, id);
  }
}
