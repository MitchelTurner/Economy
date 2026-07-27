import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { NarrationService } from './narration.service';

@Module({
  controllers: [InsightsController],
  providers: [InsightsService, NarrationService],
  exports: [InsightsService],
})
export class InsightsModule {}
