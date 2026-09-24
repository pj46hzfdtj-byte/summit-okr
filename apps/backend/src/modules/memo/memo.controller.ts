import { Controller, Get, Post, Patch, Delete, Body, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { MemoService } from './memo.service';
import type { CreateMemoDto, UpdateMemoDto } from '@summit-okr/api-types';

@ApiTags('备忘 Memo')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('memos')
export class MemoController {
  constructor(private readonly service: MemoService) {}

  @Get()
  @ApiOperation({ summary: '按 owner 查询备忘列表' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('ownerType') ownerType: string,
    @Query('ownerId') ownerId: string,
  ) {
    return this.service.listByOwner(user.sub, ownerType, ownerId);
  }

  @Post()
  @ApiOperation({ summary: '创建备忘' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateMemoDto) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新备忘' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMemoDto,
  ) {
    return this.service.update(id, user.sub, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除备忘' })
  async delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.service.delete(id, user.sub);
    return { success: true };
  }
}
