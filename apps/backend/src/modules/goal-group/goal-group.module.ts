import { Module } from '@nestjs/common';
import { GoalGroupController } from './goal-group.controller';
import { GoalGroupService } from './goal-group.service';
import { AlgorithmService } from '../../shared/algorithm.service';

@Module({
  controllers: [GoalGroupController],
  providers: [GoalGroupService, AlgorithmService],
  exports: [GoalGroupService],
})
export class GoalGroupModule {}
