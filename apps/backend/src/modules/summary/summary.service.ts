import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AlgorithmService } from '../../shared/algorithm.service';
import { FocusCycleService } from '../focus-cycle/focus-cycle.service';
import type { SummaryData, Objective } from '@summit-okr/api-types';
import dayjs from 'dayjs';

@Injectable()
export class SummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly algorithm: AlgorithmService,
    private readonly focusCycleService: FocusCycleService,
  ) {}

  async getSummary(userId: string): Promise<SummaryData> {
    const [activeCycle, counts, todayTasks, lagging, extras] = await Promise.all([
      this.focusCycleService.getActive(userId),
      this.getCounts(userId),
      this.getTodayTasks(userId),
      this.getLaggingObjectives(userId),
      this.getTodayExtras(userId),
    ]);

    // 随机抽一条动机
    const motivations = await this.prisma.objective.findMany({
      where: {
        userId,
        deletedAt: null,
        status: { in: ['in_progress', 'not_started'] },
      },
      select: { motivations: true },
    });
    const flat = motivations
      .flatMap((m) => m.motivations as string[])
      .filter(Boolean);
    const randomMotivation =
      flat.length > 0 ? flat[Math.floor(Math.random() * flat.length)] : null;

    // 周期剩余天数与时间进度
    let cycleDaysRemaining: number | null = null;
    let cycleTimeProgress: number | null = null;
    if (activeCycle) {
      const start = new Date(activeCycle.startAt).getTime();
      const end = new Date(activeCycle.endAt).getTime();
      const now = Date.now();
      cycleDaysRemaining = Math.max(0, dayjs(end).diff(dayjs().startOf('day'), 'day'));
      cycleTimeProgress =
        now <= start ? 0 : now >= end ? 1 : (now - start) / (end - start);
    }

    return {
      activeFocusCycle: activeCycle as any,
      totalObjectives: counts.total,
      inProgressObjectives: counts.inProgress,
      completedObjectives: counts.completed,
      laggingObjectives: lagging as unknown as Objective[],
      todayTasks: todayTasks as any,
      randomMotivation,
      todayAddedRecords: extras.todayAddedRecords,
      todayTaskCount: extras.todayTaskCount,
      cycleDaysRemaining,
      cycleTimeProgress,
      todayProgressDelta: extras.todayProgressDelta,
    };
  }

  /**
   * 今日维度补充数据：新增记录数、今日任务总数、今日进度增量
   */
  private async getTodayExtras(userId: string) {
    const dayStart = dayjs().startOf('day').toDate();
    const dayEnd = dayjs().endOf('day').toDate();

    const [todayAddedRecords, todayTaskCount] = await Promise.all([
      this.prisma.record.count({
        where: {
          recordedAt: { gte: dayStart, lte: dayEnd },
          keyResult: {
            deletedAt: null,
            objective: { userId, deletedAt: null },
          },
        },
      }),
      this.prisma.task.count({
        where: {
          userId,
          deletedAt: null,
          scheduledAt: { gte: dayStart, lte: dayEnd },
        },
      }),
    ]);

    // 今日进度增量：所有进行中目标的「含今日记录完成度」-「剔除今日记录完成度」的平均差值
    let todayProgressDelta: number | null = null;
    const objectives = await this.prisma.objective.findMany({
      where: { userId, deletedAt: null, status: 'in_progress' },
      include: {
        keyResults: {
          where: { deletedAt: null },
          include: { records: { orderBy: { recordedAt: 'asc' } } },
        },
      },
    });
    if (objectives.length > 0) {
      let sum = 0;
      let n = 0;
      for (const o of objectives) {
        const mapRecords = (filterToday: boolean) =>
          o.keyResults.map((kr: any) => ({
            weight: kr.weight,
            currentValue: kr.currentValue,
            initialValue: kr.initialValue,
            targetValue: kr.targetValue,
            calculationType: kr.calculationType,
            customFormula: kr.customFormula,
            records: (filterToday
              ? kr.records.filter(
                  (r: any) => !dayjs(r.recordedAt).isSame(dayStart, 'day'),
                )
              : kr.records
            ).map((r: any) => ({ value: r.value, recordedAt: r.recordedAt })),
            minRecordCount: kr.minRecordCount,
          }));
        const withToday = this.algorithm.computeObjectiveScore(mapRecords(false));
        const withoutToday = this.algorithm.computeObjectiveScore(mapRecords(true));
        sum += withToday - withoutToday;
        n++;
      }
      if (n > 0) todayProgressDelta = Math.max(0, sum / n);
    }

    return { todayAddedRecords, todayTaskCount, todayProgressDelta };
  }

  private async getCounts(userId: string) {
    const [total, inProgress, completed] = await Promise.all([
      this.prisma.objective.count({ where: { userId, deletedAt: null } }),
      this.prisma.objective.count({
        where: { userId, deletedAt: null, status: 'in_progress' },
      }),
      this.prisma.objective.count({
        where: { userId, deletedAt: null, status: 'completed' },
      }),
    ]);
    return { total, inProgress, completed };
  }

  private async getTodayTasks(userId: string) {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return this.prisma.task.findMany({
      where: {
        userId,
        deletedAt: null,
        scheduledAt: { gte: start, lte: end },
        OR: [
          { status: 'pending' },
          // 今日排期且今日完成的任务：供桌面组件展示 ✓ 完成态
          { status: 'completed', completedAt: { gte: start, lte: end } },
        ],
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  private async getLaggingObjectives(userId: string) {
    const objectives = await this.prisma.objective.findMany({
      where: { userId, deletedAt: null, status: 'in_progress' },
      include: {
        keyResults: { where: { deletedAt: null }, include: { records: true } },
      },
    });
    return objectives
      .map((o) => {
        const score = this.algorithm.computeObjectiveScore(
          o.keyResults.map((kr: any) => ({
            weight: kr.weight,
            currentValue: kr.currentValue,
            initialValue: kr.initialValue,
            targetValue: kr.targetValue,
            calculationType: kr.calculationType,
            customFormula: kr.customFormula,
            records: kr.records.map((r: any) => ({
              value: r.value,
              recordedAt: r.recordedAt,
            })),
            minRecordCount: kr.minRecordCount,
          })),
        );
        const isLagging = this.algorithm.isLagging(o.startAt, o.endAt, score);
        return { ...o, currentProgress: score, isLagging };
      })
      .filter((o) => o.isLagging);
  }
}
