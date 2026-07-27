import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateBudgetDto, PatchBudgetDto } from './budgets.dto';

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser) {
    return this.prisma.budget.findMany({
      where: { householdId: user.householdId },
      include: { category: true },
      orderBy: { startsOn: 'desc' },
    });
  }

  create(user: AuthUser, dto: CreateBudgetDto) {
    return this.prisma.budget.create({
      data: {
        householdId: user.householdId,
        categoryId: dto.categoryId,
        period: dto.period,
        amountCents: dto.amountCents,
        startsOn: new Date(dto.startsOn),
        endsOn: dto.endsOn ? new Date(dto.endsOn) : null,
      },
    });
  }

  async patch(user: AuthUser, id: string, dto: PatchBudgetDto) {
    const existing = await this.prisma.budget.findFirst({
      where: { id, householdId: user.householdId },
    });
    if (!existing) throw new NotFoundException('Budget not found');

    return this.prisma.budget.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        period: dto.period,
        amountCents: dto.amountCents,
        startsOn: dto.startsOn ? new Date(dto.startsOn) : undefined,
        endsOn:
          dto.endsOn === undefined
            ? undefined
            : dto.endsOn
              ? new Date(dto.endsOn)
              : null,
      },
    });
  }
}
