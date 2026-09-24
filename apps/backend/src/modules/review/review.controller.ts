import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { ReviewService } from './review.service';
import type { CreateReviewDto, UpdateReviewDto } from '@summit-okr/api-types';

@ApiTags('复盘 Review')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('reviews')
export class ReviewController {
  constructor(private readonly service: ReviewService) {}

  @Get()
  @ApiOperation({ summary: '复盘列表（可按 type 过滤）' })
  async list(@CurrentUser() user: JwtPayload, @Query('type') type?: string) {
    return this.service.listByUser(user.sub, type);
  }

  @Get('by-objective/:objectiveId')
  @ApiOperation({ summary: '获取目标的复盘历史' })
  async listByObjective(
    @Param('objectiveId') objectiveId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listByObjective(objectiveId, user.sub);
  }

  @Post()
  @ApiOperation({ summary: '创建复盘（期中/期末）' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateReviewDto) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新期中复盘' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.service.update(id, user.sub, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除复盘（期末删除会回退目标状态）' })
  async delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.service.delete(id, user.sub);
    return { success: true };
  }
}
