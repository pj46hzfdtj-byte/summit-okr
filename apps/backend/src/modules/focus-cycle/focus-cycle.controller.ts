import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { FocusCycleService } from './focus-cycle.service';
import type { CreateFocusCycleDto, UpdateFocusCycleDto, UpdateFocusCycleObjectiveWeightDto } from '@summit-okr/api-types';

@ApiTags('专注周期 FocusCycle')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('focus-cycles')
export class FocusCycleController {
  constructor(private readonly service: FocusCycleService) {}

  @Get('active')
  @ApiOperation({ summary: '获取当前活跃专注周期（含周期得分）' })
  async getActive(@CurrentUser() user: JwtPayload) {
    return this.service.getActive(user.sub);
  }

  @Post()
  @ApiOperation({ summary: '创建专注周期（全局单一约束）' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateFocusCycleDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新活跃周期（名称/起止时间，B5.5）' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateFocusCycleDto,
  ) {
    return this.service.update(id, user.sub, dto);
  }

  @Patch(':cycleId/objectives/:objectiveId/weight')
  @ApiOperation({ summary: '更新周期内某目标的权重' })
  async updateWeight(
    @Param('cycleId') cycleId: string,
    @Param('objectiveId') objectiveId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { weight: number },
  ) {
    await this.service.updateObjectiveWeight(cycleId, user.sub, objectiveId, body.weight);
    return { success: true };
  }

  @Post(':cycleId/end')
  @ApiOperation({ summary: '结束专注周期（设为不活跃）' })
  async endCycle(@Param('cycleId') cycleId: string, @CurrentUser() user: JwtPayload) {
    await this.service.endCycle(cycleId, user.sub);
    return { success: true };
  }
}
