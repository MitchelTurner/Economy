import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto, PatchBudgetDto } from './budgets.dto';

@Controller('budgets')
@UseGuards(JwtAuthGuard)
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.budgets.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBudgetDto) {
    return this.budgets.create(user, dto);
  }

  @Patch(':id')
  patch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PatchBudgetDto,
  ) {
    return this.budgets.patch(user, id, dto);
  }
}
