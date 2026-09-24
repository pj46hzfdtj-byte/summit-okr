import { Module } from '@nestjs/common';
import { KeyResultController } from './key-result.controller';
import { KeyResultService } from './key-result.service';
import { AlgorithmService } from '../../shared/algorithm.service';

@Module({
  controllers: [KeyResultController],
  providers: [KeyResultService, AlgorithmService],
  exports: [KeyResultService],
})
export class KeyResultModule {}
