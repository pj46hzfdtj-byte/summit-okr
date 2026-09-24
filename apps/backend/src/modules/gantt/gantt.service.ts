import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AlgorithmService } from '../../shared/algorithm.service';
import type { GanttData, GanttItem, KrConfidence } from '@summit-okr/api-types';

const CONFIDENCE_RANK: Record<KrConfidence, number> = {
  on_track: 0,
  at_risk: 1,
  off_track: 2,
};

@Injectable()
export class GanttService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly algorithm: AlgorithmService,
  ) {}

  async getGantt(
    userId: string,
    scope: 'all' | 'cycle' = 'all',
    goalGroupId?: string,
  ): Promise<GanttData> {
    let objectiveIds: string[] | undefined;
    if (scope === 'cycle') {
      const cycle = await this.prisma.focusCycle.findFirst({
        where: { userId, isActive: true },
        include: { objectives: true },
      });
      if (cycle) {
        objectiveIds = cycle.objectives.map((o) => o.objectiveId);
      }
    }

    const objectives = await this.prisma.objective.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(objectiveIds ? { id: { in: objectiveIds } } : {}),
        ...(goalGroupId ? { goalGroupId } : {}),
        startAt: { not: null },
        endAt: { not: null },
      },
      include: {
        keyResults: { where: { deletedAt: null }, include: { records: true } },
      },
    });

    const items: GanttItem[] = objectives.map((o) => {
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
      const expected = this.algorithm.computeExpectedProgress(o.startAt, o.endAt);
      // 取该目标下最差的 KR 信心度（用于甘特图角标/边框着色）
      let worstConfidence: KrConfidence = 'on_track';
      for (const kr of o.keyResults) {
        const conf = (kr as any).confidence as KrConfidence;
        if (CONFIDENCE_RANK[conf] > CONFIDENCE_RANK[worstConfidence]) {
          worstConfidence = conf;
        }
      }
      return {
        id: o.id,
        title: o.title,
        color: o.color,
        startAt: o.startAt!.toISOString(),
        endAt: o.endAt!.toISOString(),
        currentProgress: score,
        expectedProgress: expected,
        isLagging: this.algorithm.isLagging(o.startAt, o.endAt, score),
        status: o.status as any,
        worstConfidence,
      };
    });

    if (items.length === 0) {
      return { items: [], todayLine: new Date().toISOString(), rangeStart: new Date().toISOString(), rangeEnd: new Date().toISOString() };
    }

    const rangeStart = items.reduce(
      (min, i) => (i.startAt < min ? i.startAt : min),
      items[0].startAt,
    );
    const rangeEnd = items.reduce(
      (max, i) => (i.endAt > max ? i.endAt : max),
      items[0].endAt,
    );

    return {
      items,
      todayLine: new Date().toISOString(),
      rangeStart,
      rangeEnd,
    };
  }
}
