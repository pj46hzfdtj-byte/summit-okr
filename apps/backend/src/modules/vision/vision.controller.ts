import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { VisionService } from './vision.service';
import type { CreateVisionDto, UpdateVisionDto } from '@summit-okr/api-types';

@ApiTags('愿景 Vision')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('visions')
export class VisionController {
  constructor(private readonly service: VisionService) {}

  @Get()
  @ApiOperation({ summary: '愿景列表' })
  async list(@CurrentUser() user: JwtPayload) {
    return this.service.list(user.sub);
  }

  @Post()
  @ApiOperation({ summary: '创建愿景' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateVisionDto) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新愿景' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateVisionDto,
  ) {
    return this.service.update(id, user.sub, dto);
  }

  @Post(':id/achieve')
  @ApiOperation({ summary: '标记愿景为已实现' })
  async markAchieved(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.markAchieved(id, user.sub);
  }

  @Post(':id/reset-status')
  @ApiOperation({ summary: '重置愿景状态为自动计算' })
  async resetStatus(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.resetStatus(id, user.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除愿景' })
  async delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.service.delete(id, user.sub);
    return { success: true };
  }
}
