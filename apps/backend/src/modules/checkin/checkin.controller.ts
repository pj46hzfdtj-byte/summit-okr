import { Controller, Get, Put, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { CheckinService } from './checkin.service';
import type { UpsertCheckInDto } from '@summit-okr/api-types';

@ApiTags('Check-in')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('checkins')
export class CheckinController {
  constructor(private readonly service: CheckinService) {}

  @Get('status')
  @ApiOperation({ summary: '本周 check-in 状态' })
  async status(@CurrentUser() user: JwtPayload, @Query('tz') tz?: number) {
    return this.service.getStatus(user.sub, tz);
  }

  @Put('this-week')
  @ApiOperation({ summary: '本周打卡（幂等，可更新备注）' })
  async upsert(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertCheckInDto,
    @Query('tz') tz?: number,
  ) {
    return this.service.upsertThisWeek(user.sub, dto?.note, tz);
  }

  @Get('history')
  @ApiOperation({ summary: '历史打卡（最近 12 周）' })
  async history(@CurrentUser() user: JwtPayload) {
    return this.service.history(user.sub);
  }
}
