import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicIndexService } from './public-index.service';

@Module({
  controllers: [PublicController],
  providers: [PublicIndexService],
  exports: [PublicIndexService],
})
export class PublicModule {}
