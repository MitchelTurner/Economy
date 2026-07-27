import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PricesController } from './prices.controller';
import { PricesService } from './prices.service';
import { PricesProcessor } from './prices.processor';
import { IndexRollupService } from './index-rollup.service';
import { IndexRollupProcessor } from './index-rollup.processor';
import { QUEUE_PRICE_INDEX, QUEUE_PRICE_OBSERVE } from '../jobs/queues';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_PRICE_OBSERVE },
      { name: QUEUE_PRICE_INDEX },
    ),
  ],
  controllers: [PricesController],
  providers: [
    PricesService,
    PricesProcessor,
    IndexRollupService,
    IndexRollupProcessor,
  ],
  exports: [PricesService, IndexRollupService],
})
export class PricesModule {}
