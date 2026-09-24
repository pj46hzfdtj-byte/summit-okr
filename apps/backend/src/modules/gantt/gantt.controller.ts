import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { GanttService } from './gantt.service';

@ApiTags('甘特图 Gantt')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('gantt')
export class GanttController {
  constructor(private readonly service: GanttService) {}

  @Get()
  @ApiOperation({ summary: '获取甘特图数据（含今日红线 + 滞后判定）' })
  async getGantt(
    @CurrentUser() user: JwtPayload,
    @Query('scope') scope?: 'all' | 'cycle',
    @Query('goalGroupId') goalGroupId?: string,
  ) {
    return this.service.getGantt(user.sub, scope ?? 'all', goalGroupId);
  }
}
