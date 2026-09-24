import { Module } from '@nestjs/common';
import { RecordController } from './record.controller';
import { RecordService } from './record.service';
import { AlgorithmService } from '../../shared/algorithm.service';

@Module({
  controllers: [RecordController],
  providers: [RecordService, AlgorithmService],
  exports: [RecordService],
})
export class RecordModule {}
