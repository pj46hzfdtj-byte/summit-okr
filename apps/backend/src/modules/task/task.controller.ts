import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { TaskService } from './task.service';
import type { CreateTaskDto, UpdateTaskDto } from '@summit-okr/api-types';

@ApiTags('任务 Task')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('tasks')
export class TaskController {
  constructor(private readonly service: TaskService) {}

  @Get()
  @ApiOperation({ summary: '任务列表（可按状态/日期过滤）' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('date') date?: string,
  ) {
    return this.service.list(user.sub, { status, date });
  }

  @Post()
  @ApiOperation({ summary: '创建任务' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTaskDto) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新任务' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.service.update(id, user.sub, dto);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: '完成/取消完成任务' })
  async complete(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { completed: boolean },
  ) {
    return this.service.complete(id, user.sub, body.completed);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除任务' })
  async delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.service.delete(id, user.sub);
    return { success: true };
  }

  @Post('delete-overdue')
  @ApiOperation({ summary: '一键删除过去一周过期未完成任务（v4.1.11）' })
  async deleteOverdue(@CurrentUser() user: JwtPayload) {
    return this.service.deleteOverdue(user.sub);
  }

  @Post('batch-delete')
  @ApiOperation({ summary: '批量删除任务（v4.1.14）' })
  async batchDelete(
    @CurrentUser() user: JwtPayload,
    @Body() body: { ids: string[] },
  ) {
    return this.service.batchDelete(user.sub, body.ids);
  }
}
