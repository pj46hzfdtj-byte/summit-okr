import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { GoalGroupService } from './goal-group.service';
import type {
  GoalGroup,
  CreateGoalGroupDto,
  UpdateGoalGroupDto,
} from '@summit-okr/api-types';

@ApiTags('目标节点 GoalGroup')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('goal-groups')
export class GoalGroupController {
  constructor(private readonly service: GoalGroupService) {}

  @Get()
  @ApiOperation({ summary: '获取目标节点树（含子节点+可选目标）' })
  async getTree(
    @CurrentUser() user: JwtPayload,
    @Query('includeObjectives') includeObjectives?: string,
  ): Promise<GoalGroup[]> {
    return this.service.getTree(user.sub, includeObjectives === 'true');
  }

  @Post()
  @ApiOperation({ summary: '创建目标节点' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateGoalGroupDto,
  ): Promise<GoalGroup> {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新目标节点' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateGoalGroupDto,
  ): Promise<GoalGroup> {
    return this.service.update(id, user.sub, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除目标节点（级联）' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: boolean }> {
    await this.service.delete(id, user.sub);
    return { success: true };
  }

  @Post('reorder')
  @ApiOperation({ summary: '批量重排序目标节点' })
  async reorder(
    @CurrentUser() user: JwtPayload,
    @Body() body: { ids: string[] },
  ): Promise<{ success: boolean }> {
    await this.service.reorder(user.sub, body.ids);
    return { success: true };
  }
}
