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
import { KeyResultService } from './key-result.service';
import type { CreateKeyResultDto, UpdateKeyResultDto } from '@summit-okr/api-types';

@ApiTags('关键结果 KeyResult')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('key-results')
export class KeyResultController {
  constructor(private readonly service: KeyResultService) {}

  @Get('by-objective/:objectiveId')
  @ApiOperation({ summary: '获取目标下所有 KR' })
  async listByObjective(
    @Param('objectiveId') objectiveId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listByObjective(objectiveId, user.sub);
  }

  @Post()
  @ApiOperation({ summary: '创建关键结果' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateKeyResultDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新关键结果' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateKeyResultDto,
  ) {
    return this.service.update(id, user.sub, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除关键结果' })
  async delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.service.delete(id, user.sub);
    return { success: true };
  }
}
