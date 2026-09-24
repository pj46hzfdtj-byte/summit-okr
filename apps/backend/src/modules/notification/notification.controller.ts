import { Controller, Get, Post, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { NotificationService } from './notification.service';

@ApiTags('通知 Notification')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  @ApiOperation({ summary: '通知列表（含未读数，自动按规则刷新）' })
  async list(@CurrentUser() user: JwtPayload) {
    return this.service.list(user.sub);
  }

  @Post(':id/read')
  @ApiOperation({ summary: '标记已读' })
  async markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.service.markRead(user.sub, id);
    return { success: true };
  }

  @Post('read-all')
  @ApiOperation({ summary: '全部标记已读' })
  async markAllRead(@CurrentUser() user: JwtPayload) {
    await this.service.markAllRead(user.sub);
    return { success: true };
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除通知' })
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.service.remove(user.sub, id);
    return { success: true };
  }
}
