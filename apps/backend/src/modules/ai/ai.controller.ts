import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { AiService } from './ai.service';
import type {
  AiPlanGoalDto,
  AiPlanTaskDto,
  AiSuggestMotivationsDto,
} from '@summit-okr/api-types';

@ApiTags('AI 助手 AI')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('ai')
export class AiController {
  constructor(private readonly service: AiService) {}

  @Post('plan-goal')
  @ApiOperation({ summary: 'AI 协助规划目标（输入大目标 → 输出 O+KR）' })
  async planGoal(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AiPlanGoalDto,
  ) {
    return this.service.planGoal(user.sub, dto);
  }

  @Post('plan-tasks')
  @ApiOperation({ summary: 'AI 协助规划任务（基于目标/KR 拆解任务）' })
  async planTasks(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AiPlanTaskDto,
  ) {
    return this.service.planTasks(user.sub, dto);
  }

  @Post('suggest-score')
  @ApiOperation({ summary: 'AI 复盘自动评分（给出 KR 评分建议分）' })
  async suggestScore(
    @CurrentUser() user: JwtPayload,
    @Body('objectiveId') objectiveId: string,
  ) {
    return this.service.suggestScore(user.sub, objectiveId);
  }

  @Post('suggest-motivations')
  @ApiOperation({ summary: 'AI 建议目标动机' })
  async suggestMotivations(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AiSuggestMotivationsDto,
  ) {
    return this.service.suggestMotivations(user.sub, dto);
  }

  @Post('weekly-report')
  @ApiOperation({ summary: 'AI 生成本周周报（基于真实记录/任务/打卡数据）' })
  async weeklyReport(@CurrentUser() user: JwtPayload) {
    return this.service.weeklyReport(user.sub);
  }

  @Get('conversations')
  @ApiOperation({ summary: '查询 AI 对话历史' })
  async listConversations(@CurrentUser() user: JwtPayload) {
    return this.service.listConversations(user.sub);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: '查询某个对话详情' })
  async getConversation(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.getConversation(user.sub, id);
  }

  @Get('usage')
  @ApiOperation({ summary: '今日 AI 用量统计' })
  async getUsage(@CurrentUser() user: JwtPayload) {
    return this.service.getUsage(user.sub);
  }
}
