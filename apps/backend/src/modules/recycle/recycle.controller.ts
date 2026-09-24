import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { RecycleService } from './recycle.service';
import type { RecycleEntityType } from '@summit-okr/api-types';

@ApiTags('回收站 Recycle')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('recycle')
export class RecycleController {
  constructor(private readonly service: RecycleService) {}

  @Get()
  @ApiOperation({ summary: '回收站列表' })
  async list(@CurrentUser() user: JwtPayload) {
    return this.service.list(user.sub);
  }

  @Post('restore')
  @ApiOperation({ summary: '恢复条目' })
  async restore(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { entityType: RecycleEntityType; id: string },
  ) {
    await this.service.restore(user.sub, dto.entityType, dto.id);
    return { success: true };
  }

  @Post('destroy')
  @ApiOperation({ summary: '彻底删除条目' })
  async destroy(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { entityType: RecycleEntityType; id: string },
  ) {
    await this.service.destroy(user.sub, dto.entityType, dto.id);
    return { success: true };
  }

  @Delete('empty')
  @ApiOperation({ summary: '清空回收站' })
  async empty(@CurrentUser() user: JwtPayload) {
    return this.service.empty(user.sub);
  }
}
