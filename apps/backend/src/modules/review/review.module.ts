import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { AlgorithmService } from '../../shared/algorithm.service';

@Module({
  controllers: [ReviewController],
  providers: [ReviewService, AlgorithmService],
})
export class ReviewModule {}
