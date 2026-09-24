import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { RecycleService } from '../recycle/recycle.service';

/**
 * 定时任务：
 * - 每小时为所有用户刷新通知规则（不再只依赖访问时的惰性生成）
 * - 每小时清理回收站中超过保留期的条目
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
    private readonly recycle: RecycleService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async hourlyMaintenance(): Promise<void> {
    const users = await this.prisma.user.findMany({ select: { id: true } });
    let ok = 0;
    let fail = 0;
    for (const u of users) {
      try {
        await this.notification.refreshForUser(u.id);
        await this.recycle.purgeExpiredForUser(u.id);
        ok++;
      } catch (e) {
        fail++;
        this.logger.error(`定时维护失败 userId=${u.id}: ${(e as Error).message}`);
      }
    }
    this.logger.log(`定时维护完成：成功 ${ok} 个用户，失败 ${fail} 个`);
  }
}
