import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import type { CheckIn, CheckInStatus } from '@summit-okr/api-types';

/**
 * 计算给定日期所在周的周一 00:00（按用户时区归一化）
 * @param tzOffsetMin 用户时区相对 UTC 的偏移（分钟），如 UTC+8 = 480；缺省用服务器本地时区
 */
export function weekStartOf(d: Date, tzOffsetMin?: number): Date {
  // ValidationPipe 隐式转换可能把缺省的 tz 变成 NaN，需显式兜底
  const offset = Number.isFinite(tzOffsetMin) ? (tzOffsetMin as number) : -d.getTimezoneOffset();
  // 平移到用户本地时间后按 UTC 字段计算周一，再平移回真实时刻
  const shifted = new Date(d.getTime() + offset * 60000);
  const day = shifted.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const mondayUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + diff,
  );
  return new Date(mondayUtc - offset * 60000);
}

@Injectable()
export class CheckinService {
  constructor(private readonly prisma: PrismaService) {}

  /** 本周 check-in 状态：是否已打卡 + 本周更新过的 KR 数 + 连续打卡周数 */
  async getStatus(userId: string, tzOffsetMin?: number): Promise<CheckInStatus> {
    const weekStart = weekStartOf(new Date(), tzOffsetMin);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const [checkIn, krStats, streak] = await Promise.all([
      this.prisma.checkIn.findUnique({
        where: { userId_weekStart: { userId, weekStart } },
      }),
      this.getKrUpdateStats(userId, weekStart, weekEnd),
      this.computeStreak(userId, weekStart),
    ]);

    return {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      done: !!checkIn,
      checkIn: (checkIn as unknown as CheckIn) ?? null,
      krUpdatedCount: krStats.updated,
      totalActiveKrCount: krStats.total,
      streak,
    };
  }

  /**
   * 连续打卡周数：从本周（若已打卡）或上一周开始，向前倒推连续的 weekStart。
   * 本周未打卡时不计入，但不断链历史（从上一周开始数）。
   */
  private async computeStreak(userId: string, currentWeekStart: Date): Promise<number> {
    const history = await this.prisma.checkIn.findMany({
      where: { userId },
      select: { weekStart: true },
      orderBy: { weekStart: 'desc' },
      take: 104, // 最多回溯 2 年
    });
    if (history.length === 0) return 0;

    const weekMs = 7 * 86400000;
    const stamps = new Set(history.map((h) => new Date(h.weekStart).getTime()));

    let cursor = currentWeekStart.getTime();
    if (!stamps.has(cursor)) cursor -= weekMs; // 本周未打卡 → 从上一周开始数
    let streak = 0;
    while (stamps.has(cursor)) {
      streak++;
      cursor -= weekMs;
    }
    return streak;
  }

  /** 本周有新增记录的 KR 数 / 进行中目标的 KR 总数 */
  private async getKrUpdateStats(
    userId: string,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<{ updated: number; total: number }> {
    const objectives = await this.prisma.objective.findMany({
      where: {
        userId,
        deletedAt: null,
        status: { in: ['not_started', 'in_progress', 'pending_review'] },
      },
      select: {
        keyResults: {
          where: { deletedAt: null },
          select: {
            id: true,
            records: { where: { recordedAt: { gte: weekStart, lt: weekEnd } }, take: 1 },
          },
        },
      },
    });
    const allKrs = objectives.flatMap((o: any) => o.keyResults);
    const updated = allKrs.filter((kr: any) => kr.records.length > 0).length;
    return { updated, total: allKrs.length };
  }

  /** 本周打卡（幂等 upsert，可修改备注） */
  async upsertThisWeek(userId: string, note?: string, tzOffsetMin?: number): Promise<CheckIn> {
    const weekStart = weekStartOf(new Date(), tzOffsetMin);
    return this.prisma.checkIn.upsert({
      where: { userId_weekStart: { userId, weekStart } },
      create: { userId, weekStart, note: note ?? null },
      update: { note: note ?? null },
    }) as unknown as Promise<CheckIn>;
  }

  /** 历史打卡记录（最近 12 周） */
  async history(userId: string): Promise<CheckIn[]> {
    return this.prisma.checkIn.findMany({
      where: { userId },
      orderBy: { weekStart: 'desc' },
      take: 12,
    }) as unknown as Promise<CheckIn[]>;
  }
}
