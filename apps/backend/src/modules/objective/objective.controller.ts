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
import { ObjectiveService } from './objective.service';
import type {
  CreateObjectiveDto,
  UpdateObjectiveDto,
  ObjectiveStatus,
} from '@summit-okr/api-types';

@ApiTags('目标 Objective')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('objectives')
export class ObjectiveController {
  constructor(private readonly service: ObjectiveService) {}

  @Get()
  @ApiOperation({ summary: '目标列表（带完成度/滞后判定）' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('goalGroupId') goalGroupId?: string,
    @Query('status') status?: ObjectiveStatus,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.service.list(user.sub, {
      goalGroupId,
      status,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 50,
      includeProgress: true,
    });
    return result;
  }

  @Get(':id')
  @ApiOperation({ summary: '目标详情（含 KR/记录/复盘历史）' })
  async getById(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.getById(id, user.sub);
  }

  @Post()
  @ApiOperation({ summary: '创建目标' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateObjectiveDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新目标' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateObjectiveDto,
  ) {
    return this.service.update(id, user.sub, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除目标' })
  async delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.service.delete(id, user.sub);
    return { success: true };
  }
}
