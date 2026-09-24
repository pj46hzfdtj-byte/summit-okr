import { Module } from '@nestjs/common';
import { SummaryController } from './summary.controller';
import { SummaryService } from './summary.service';
import { AlgorithmService } from '../../shared/algorithm.service';
import { FocusCycleModule } from '../focus-cycle/focus-cycle.module';

@Module({
  imports: [FocusCycleModule],
  controllers: [SummaryController],
  providers: [SummaryService, AlgorithmService],
})
export class SummaryModule {}
