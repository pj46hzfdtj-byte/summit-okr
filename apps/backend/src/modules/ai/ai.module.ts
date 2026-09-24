import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { LlmProvider } from './llm.provider';
import { AlgorithmService } from '../../shared/algorithm.service';

@Module({
  controllers: [AiController],
  providers: [AiService, LlmProvider, AlgorithmService],
})
export class AiModule {}
