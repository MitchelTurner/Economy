import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PricesService } from './prices.service';
import { AlertsService } from '../alerts/alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_PRICE_OBSERVE } from '../jobs/queues';

@Processor(QUEUE_PRICE_OBSERVE)
export class PricesProcessor extends WorkerHost {
  private readonly logger = new Logger(PricesProcessor.name);

  constructor(
    private readonly prices: PricesService,
    private readonly alerts: AlertsService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<{ receiptId: string }>) {
    await this.prices.observeFromReceipt(job.data.receiptId);
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: job.data.receiptId },
      select: { householdId: true },
    });
    if (!receipt) return;
    const triggered = await this.alerts.checkHousehold(receipt.householdId);
    if (triggered.length) {
      this.logger.log(
        `Triggered ${triggered.length} price alerts for household ${receipt.householdId}`,
      );
    }
    return { triggered };
  }
}
