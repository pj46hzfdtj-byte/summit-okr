import { Module } from '@nestjs/common';
import { ObjectiveController } from './objective.controller';
import { ObjectiveService } from './objective.service';
import { AlgorithmService } from '../../shared/algorithm.service';

@Module({
  controllers: [ObjectiveController],
  providers: [ObjectiveService, AlgorithmService],
  exports: [ObjectiveService, AlgorithmService],
})
export class ObjectiveModule {}
