import { Controller, Get, Patch, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserService } from './user.service';
import type { UpdateUserDto, User, UserSettings } from '@summit-okr/api-types';

@ApiTags('用户 User')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: '获取当前用户信息' })
  async getMe(@CurrentUser() user: JwtPayload): Promise<User> {
    return this.userService.findById(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: '更新当前用户信息' })
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    return this.userService.update(user.sub, dto);
  }

  @Get('me/settings')
  @ApiOperation({ summary: '获取用户设置（通知偏好等）' })
  async getSettings(@CurrentUser() user: JwtPayload): Promise<UserSettings> {
    return this.userService.getSettings(user.sub);
  }

  @Put('me/settings')
  @ApiOperation({ summary: '更新用户设置（浅合并）' })
  async updateSettings(
    @CurrentUser() user: JwtPayload,
    @Body() dto: Partial<UserSettings>,
  ): Promise<UserSettings> {
    return this.userService.updateSettings(user.sub, dto);
  }
}
