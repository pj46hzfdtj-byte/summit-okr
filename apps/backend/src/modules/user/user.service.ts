import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import type { UpdateUserDto, User, UserSettings } from '@summit-okr/api-types';

/** 通知偏好默认值：全部规则开启 */
export const DEFAULT_NOTIF_PREFS: Record<string, boolean> = {
  stale_kr: true,
  cycle_ending: true,
  review_pending: true,
  task_overdue: true,
  checkin_reminder: true,
};

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    const { passwordHash, ...rest } = user;
    return rest as unknown as User;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    await this.prisma.user.update({ where: { id }, data: dto });
    return this.findById(id);
  }

  /** 获取用户设置（不存在时返回默认值） */
  async getSettings(userId: string): Promise<UserSettings> {
    const setting = await this.prisma.userSetting.findUnique({ where: { userId } });
    const data = (setting?.data as any) ?? {};
    return {
      notifPrefs: { ...DEFAULT_NOTIF_PREFS, ...(data.notifPrefs ?? {}) },
    };
  }

  /** 更新用户设置（浅合并） */
  async updateSettings(userId: string, dto: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.getSettings(userId);
    const merged: UserSettings = {
      notifPrefs: { ...current.notifPrefs, ...(dto.notifPrefs ?? {}) },
    };
    // 不用 upsert：SQLite 模式下 Json 序列化扩展只处理 create/update 顶层 data
    const existing = await this.prisma.userSetting.findUnique({ where: { userId } });
    if (existing) {
      await this.prisma.userSetting.update({
        where: { userId },
        data: { data: merged as any },
      });
    } else {
      await this.prisma.userSetting.create({
        data: { userId, data: merged as any },
      });
    }
    return merged;
  }
}
