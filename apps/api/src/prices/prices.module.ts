import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PricesController } from './prices.controller';
import { PricesService } from './prices.service';
import { PricesProcessor } from './prices.processor';
import { QUEUE_PRICE_OBSERVE } from '../jobs/queues';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_PRICE_OBSERVE })],
  controllers: [PricesController],
  providers: [PricesService, PricesProcessor],
  exports: [PricesService],
})
export class PricesModule {}
