import { Module } from '@nestjs/common';
import { VisionController } from './vision.controller';
import { VisionService } from './vision.service';
import { AlgorithmService } from '../../shared/algorithm.service';

@Module({
  controllers: [VisionController],
  providers: [VisionService, AlgorithmService],
})
export class VisionModule {}
