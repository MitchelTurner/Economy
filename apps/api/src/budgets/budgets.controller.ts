import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { consumeRateLimit } from '../common/rate-limit';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto, PatchBudgetDto } from './budgets.dto';

function householdLimit() {
  return {
    name: 'household',
    limit: Number(process.env.RATE_LIMIT_HOUSEHOLD ?? 20),
    windowMs: 60_000,
  };
}

@Controller('budgets')
@UseGuards(JwtAuthGuard)
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.budgets.list(user);
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateBudgetDto) {
    await consumeRateLimit(`${user.userId}:${user.householdId}`, {
      ...householdLimit(),
      name: 'budgets:create',
    });
    return this.budgets.create(user, dto);
  }

  @Patch(':id')
  async patch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PatchBudgetDto,
  ) {
    await consumeRateLimit(`${user.userId}:${user.householdId}`, {
      ...householdLimit(),
      name: 'budgets:patch',
    });
    return this.budgets.patch(user, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await consumeRateLimit(`${user.userId}:${user.householdId}`, {
      ...householdLimit(),
      name: 'budgets:delete',
    });
    return this.budgets.remove(user, id);
  }
}
