import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { weekStartOf } from '../checkin/checkin.service';
import type { AppNotification } from '@summit-okr/api-types';

/**
 * 通知中心：规则驱动的懒刷新。
 * title 存 i18n key，body 存 JSON 参数，由前端本地化渲染（数据库与语言解耦）。
 * dedupeKey 保证同一规则在周期内只生成一条，问题解决后也不会重复骚扰。
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<{ list: AppNotification[]; unread: number }> {
    try {
      await this.refresh(userId);
    } catch (e) {
      this.logger.error(`通知刷新失败: ${(e as Error).message}`);
    }
    const [list, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return { list: list as unknown as AppNotification[], unread };
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
  }

  // ============ 规则引擎 ============

  /** 刷新单个用户的通知（供定时任务调用） */
  async refreshForUser(userId: string): Promise<void> {
    await this.refresh(userId);
  }

  /** 读取用户通知偏好（默认全部开启） */
  private async getNotifPrefs(userId: string): Promise<Record<string, boolean>> {
    const setting = await this.prisma.userSetting.findUnique({ where: { userId } });
    const prefs = ((setting?.data as any)?.notifPrefs ?? {}) as Record<string, boolean>;
    return {
      stale_kr: true,
      cycle_ending: true,
      review_pending: true,
      task_overdue: true,
      checkin_reminder: true,
      ...prefs,
    };
  }

  private async refresh(userId: string): Promise<void> {
    const prefs = await this.getNotifPrefs(userId);
    const now = new Date();
    const dayStamp = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const rules: Array<{
      type: string;
      title: string;
      body: any;
      link?: string;
      dedupeKey: string;
    }> = [];

    // 1. 进行中的目标已过 endAt 未复盘 → review_pending
    const pendingReviews = await this.prisma.objective.findMany({
      where: { userId, deletedAt: null, status: 'pending_review' },
      select: { id: true, title: true },
    });
    for (const o of pendingReviews) {
      rules.push({
        type: 'review_pending',
        title: 'notif.reviewPending.title',
        body: { objectiveTitle: o.title },
        link: `/objectives/${o.id}`,
        dedupeKey: `review_pending:${o.id}`,
      });
    }

    // 2. KR 超过 14 天无记录（目标仍在进行中且未到期）→ stale_kr
    if (prefs.stale_kr) {
      const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
      const staleKrs = await this.prisma.keyResult.findMany({
        where: {
          deletedAt: null,
          objective: {
            userId,
            deletedAt: null,
            status: 'in_progress',
            OR: [{ endAt: null }, { endAt: { gt: now } }],
          },
        },
        select: {
          id: true,
          title: true,
          objectiveId: true,
          records: { where: { recordedAt: { gte: twoWeeksAgo } }, take: 1 },
        },
      });
      for (const kr of staleKrs) {
        if (kr.records.length === 0) {
          rules.push({
            type: 'stale_kr',
            title: 'notif.staleKr.title',
            body: { krTitle: kr.title },
            link: `/objectives/${kr.objectiveId}`,
            dedupeKey: `stale_kr:${kr.id}:${Math.floor(now.getTime() / (7 * 86400000))}`,
          });
        }
      }
    }

    // 3. 活跃周期 7 天内结束 → cycle_ending
    if (prefs.cycle_ending) {
      const activeCycle = await this.prisma.focusCycle.findFirst({
        where: { userId, isActive: true },
      });
      if (activeCycle) {
        const daysLeft = Math.ceil(
          (new Date(activeCycle.endAt).getTime() - now.getTime()) / 86400000,
        );
        if (daysLeft >= 0 && daysLeft <= 7) {
          rules.push({
            type: 'cycle_ending',
            title: 'notif.cycleEnding.title',
            body: { cycleName: activeCycle.name, days: daysLeft },
            link: '/focus-cycle',
            dedupeKey: `cycle_ending:${activeCycle.id}:${daysLeft}`,
          });
        }
      }
    }

    // 4. 逾期未完成任务（聚合为一条）→ task_overdue
    if (prefs.task_overdue) {
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const overdueCount = await this.prisma.task.count({
        where: {
          userId,
          deletedAt: null,
          status: 'pending',
          scheduledAt: { lt: todayStart },
        },
      });
      if (overdueCount > 0) {
        rules.push({
          type: 'task_overdue',
          title: 'notif.taskOverdue.title',
          body: { count: overdueCount },
          link: '/tasks',
          dedupeKey: `task_overdue:${dayStamp}`,
        });
      }
    }

    // 5. 本周尚未 Check-in（周四起提醒）→ checkin_reminder
    if (prefs.checkin_reminder) {
      const weekStart = weekStartOf(now);
      const dow = now.getDay(); // 0=Sun
      if (dow === 4 || dow === 5 || dow === 6) {
        const checkIn = await this.prisma.checkIn.findUnique({
          where: { userId_weekStart: { userId, weekStart } },
          select: { id: true },
        });
        if (!checkIn) {
          rules.push({
            type: 'checkin_reminder',
            title: 'notif.checkinReminder.title',
            body: {},
            link: '/summary',
            dedupeKey: `checkin_reminder:${weekStart.toISOString().slice(0, 10)}`,
          });
        }
      }
    }

    if (rules.length === 0) return;
    // SQLite 的 createMany 不支持 skipDuplicates，先查已有 dedupeKey 再过滤
    const existing = await this.prisma.notification.findMany({
      where: { userId, dedupeKey: { in: rules.map((r) => r.dedupeKey) } },
      select: { dedupeKey: true },
    });
    const existingKeys = new Set(existing.map((n) => n.dedupeKey));
    const fresh = rules.filter((r) => !existingKeys.has(r.dedupeKey));
    if (fresh.length === 0) return;
    await this.prisma.notification.createMany({
      data: fresh.map((r) => ({
        userId,
        type: r.type,
        title: r.title,
        body: JSON.stringify(r.body ?? {}),
        link: r.link ?? null,
        dedupeKey: r.dedupeKey,
      })),
    });
  }
}
