import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { RecordService } from './record.service';
import type { CreateRecordDto, UpdateRecordDto } from '@summit-okr/api-types';

@ApiTags('记录 Record')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('records')
export class RecordController {
  constructor(private readonly service: RecordService) {}

  @Get('trend/:keyResultId')
  @ApiOperation({ summary: '获取记录趋势图数据' })
  async getTrend(
    @Param('keyResultId') keyResultId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getTrend(keyResultId, user.sub);
  }

  @Post()
  @ApiOperation({ summary: '添加记录（触发 KR 进度重算）' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRecordDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新记录' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateRecordDto,
  ) {
    return this.service.update(id, user.sub, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除记录' })
  async delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.service.delete(id, user.sub);
    return { success: true };
  }
}
