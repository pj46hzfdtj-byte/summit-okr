import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { SummaryService } from './summary.service';

@ApiTags('摘要 Summary')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('summary')
export class SummaryController {
  constructor(private readonly service: SummaryService) {}

  @Get()
  @ApiOperation({ summary: '获取摘要页数据（活跃周期+统计+今日任务+滞后目标+随机动机）' })
  async getSummary(@CurrentUser() user: JwtPayload) {
    return this.service.getSummary(user.sub);
  }
}
