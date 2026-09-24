import { Module } from '@nestjs/common';
import { GanttController } from './gantt.controller';
import { GanttService } from './gantt.service';
import { AlgorithmService } from '../../shared/algorithm.service';

@Module({
  controllers: [GanttController],
  providers: [GanttService, AlgorithmService],
})
export class GanttModule {}
