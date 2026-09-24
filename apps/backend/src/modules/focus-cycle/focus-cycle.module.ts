import { Module } from '@nestjs/common';
import { FocusCycleController } from './focus-cycle.controller';
import { FocusCycleService } from './focus-cycle.service';
import { AlgorithmService } from '../../shared/algorithm.service';

@Module({
  controllers: [FocusCycleController],
  providers: [FocusCycleService, AlgorithmService],
  exports: [FocusCycleService],
})
export class FocusCycleModule {}
