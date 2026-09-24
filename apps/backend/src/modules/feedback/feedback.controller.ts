import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { FeedbackService, CreateFeedbackDto } from './feedback.service';

@ApiTags('意见反馈 Feedback')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Post()
  @ApiOperation({ summary: '提交意见反馈' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateFeedbackDto) {
    return this.service.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: '查询我的反馈历史' })
  async list(@CurrentUser() user: JwtPayload) {
    return this.service.listByUser(user.sub);
  }
}
