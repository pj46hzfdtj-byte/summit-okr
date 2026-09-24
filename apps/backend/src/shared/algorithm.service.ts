import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CalculationType } from '@summit-okr/api-types';
import dayjs from 'dayjs';

/**
 * OKR 核心算法服务
 * 实现文档 §5 的全部算法：
 *  - 5.1 KR 完成度（5 种取值方式）
 *  - 5.2 目标完成度（加权平均）
 *  - 5.3 周期得分（满分 100）
 *  - 5.4 滞后判定
 */
@Injectable()
export class AlgorithmService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ §5.1 KR 完成度 ============

  /**
   * 根据 records 重新计算 KR 的 currentValue
   * 4 种（+1 自定义）取值方式算法
   */
  computeCurrentValue(
    records: { value: number; recordedAt: Date }[],
    type: CalculationType,
    initialValue: number,
    customFormula?: string | null,
  ): number {
    if (records.length === 0) return initialValue;

    switch (type) {
      case 'sum':
        // 累计值：所有记录累加
        return records.reduce((sum, r) => sum + r.value, 0);

      case 'final':
        // 最终值：按时间排序取最后一条
        const sorted = [...records].sort(
          (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
        );
        return sorted[sorted.length - 1].value;

      case 'average':
        // 平均值：所有记录平均
        return records.reduce((sum, r) => sum + r.value, 0) / records.length;

      case 'max':
        // 最大值：所有记录最大
        return Math.max(...records.map((r) => r.value));

      case 'custom':
        // 自定义公式（沙箱受限，目前仅返回 sum，预留扩展点）
        // TODO: 后续接入安全沙箱（如 isolated-vm）执行用户自定义公式
        return this.applyCustomFormula(customFormula, records, initialValue);

      default:
        return initialValue;
    }
  }

  /**
   * 计算 KR 完成度（0-1）
   * 公式: (current - initial) / (target - initial)
   * 边界: <0 → 0, >1 → 1
   */
  computeKrScore(
    currentValue: number,
    initialValue: number,
    targetValue: number,
  ): number {
    if (targetValue === initialValue) return 0;
    const ratio = (currentValue - initialValue) / (targetValue - initialValue);
    return Math.max(0, Math.min(1, ratio));
  }

  // ============ §5.2 目标完成度（加权平均） ============

  /**
   * 计算目标完成度（0-1）
   * 加权平均：Σ(KR_score × KR_weight) / Σ KR_weight
   */
  computeObjectiveScore(
    keyResults: {
      weight: number;
      currentValue: number;
      initialValue: number;
      targetValue: number;
      calculationType: CalculationType;
      customFormula?: string | null;
      records: { value: number; recordedAt: Date }[];
      minRecordCount?: number;
    }[],
  ): number {
    if (keyResults.length === 0) return 0;

    let totalWeight = 0;
    let weightedSum = 0;

    for (const kr of keyResults) {
      // 若 KR 未达到最少记录数，跳过（不参与进度计算）
      if (kr.minRecordCount && kr.records.length < kr.minRecordCount) continue;

      const currentValue = this.computeCurrentValue(
        kr.records,
        kr.calculationType,
        kr.initialValue,
        kr.customFormula,
      );
      const score = this.computeKrScore(
        currentValue,
        kr.initialValue,
        kr.targetValue,
      );

      totalWeight += kr.weight;
      weightedSum += score * kr.weight;
    }

    if (totalWeight === 0) return 0;
    return weightedSum / totalWeight;
  }

  // ============ §5.3 周期得分（满分 100） ============

  /**
   * 计算专注周期得分（0-100）
   * 公式：Σ(目标完成度 × 目标权重) × 100
   * 约束：周期内所有目标权重之和 = 100
   */
  computeCycleScore(
    objectiveWeights: { objectiveId: string; weight: number; score: number }[],
  ): number {
    if (objectiveWeights.length === 0) return 0;

    const totalWeight = objectiveWeights.reduce((s, o) => s + o.weight, 0);
    if (totalWeight === 0) return 0;

    // 归一化：权重之和应为 100
    const normalized =
      objectiveWeights.reduce((s, o) => s + o.score * o.weight, 0) / totalWeight;
    return Math.round(normalized * 100);
  }

  // ============ §5.4 滞后判定 ============

  /**
   * 判定目标是否滞后
   * 算法：若当前完成度 < 今日预期完成度，则视为滞后
   */
  isLagging(
    startAt: Date | null,
    endAt: Date | null,
    currentScore: number,
    now: Date = new Date(),
  ): boolean {
    if (!startAt || !endAt) return false;
    const nowTs = now.getTime();
    const startTs = startAt.getTime();
    const endTs = endAt.getTime();

    // 还未开始或已结束，不判定滞后
    if (nowTs < startTs || nowTs > endTs) return false;

    const expected = (nowTs - startTs) / (endTs - startTs);
    return currentScore < expected;
  }

  /**
   * 计算今日预期完成度（0-1）
   */
  computeExpectedProgress(
    startAt: Date | null,
    endAt: Date | null,
    now: Date = new Date(),
  ): number {
    if (!startAt || !endAt) return 0;
    const startTs = startAt.getTime();
    const endTs = endAt.getTime();
    const nowTs = now.getTime();
    if (nowTs < startTs) return 0;
    if (nowTs > endTs) return 1;
    return (nowTs - startTs) / (endTs - startTs);
  }

  // ============ 高层封装：刷新 KR 的 currentValue ============

  /**
   * 重新计算某个 KR 的 currentValue 并写入数据库
   * 在 Record 增删改后调用
   */
  async refreshKrCurrentValue(keyResultId: string): Promise<number> {
    const kr = await this.prisma.keyResult.findUnique({
      where: { id: keyResultId },
      include: {
        records: {
          orderBy: { recordedAt: 'asc' },
        },
      },
    });
    if (!kr) return 0;

    const currentValue = this.computeCurrentValue(
      kr.records,
      kr.calculationType as CalculationType,
      kr.initialValue,
      kr.customFormula,
    );

    await this.prisma.keyResult.update({
      where: { id: keyResultId },
      data: { currentValue },
    });

    return currentValue;
  }

  /**
   * 计算目标的完成度（实时聚合，不写入 DB）
   */
  async computeObjectiveScoreFromDb(objectiveId: string): Promise<number> {
    const objective = await this.prisma.objective.findUnique({
      where: { id: objectiveId },
      include: {
        keyResults: {
          include: { records: { orderBy: { recordedAt: 'asc' } } },
        },
      },
    });
    if (!objective) return 0;

    return this.computeObjectiveScore(
      objective.keyResults.map((kr) => ({
        weight: kr.weight,
        currentValue: kr.currentValue,
        initialValue: kr.initialValue,
        targetValue: kr.targetValue,
        calculationType: kr.calculationType as CalculationType,
        customFormula: kr.customFormula,
        records: kr.records.map((r) => ({
          value: r.value,
          recordedAt: r.recordedAt,
        })),
        minRecordCount: kr.minRecordCount,
      })),
    );
  }

  // ============ 自定义公式沙箱（预留） ============

  private applyCustomFormula(
    formula: string | null | undefined,
    records: { value: number; recordedAt: Date }[],
    initialValue: number,
  ): number {
    if (!formula) return initialValue;

    // 安全校验：仅允许 [A-Z, a-z, 0-9, _, ., +, -, *, /, (, ), space]
    if (!/^[A-Za-z0-9_\.\+\-\*\/\(\)\s]+$/.test(formula)) {
      return initialValue;
    }

    // 简化实现：暴露 sum/avg/max/min/last/initial 作为预定义变量
    // 实际生产应使用 isolated-vm 或 vm2 沙箱执行
    try {
      const sum = records.reduce((s, r) => s + r.value, 0);
      const avg = records.length ? sum / records.length : 0;
      const max = records.length ? Math.max(...records.map((r) => r.value)) : 0;
      const min = records.length ? Math.min(...records.map((r) => r.value)) : 0;
      const last = records.length
        ? records[records.length - 1].value
        : initialValue;
      const count = records.length;

      // eslint-disable-next-line no-new-func
      const fn = new Function(
        'sum',
        'avg',
        'max',
        'min',
        'last',
        'count',
        'initial',
        `return ${formula}`,
      );
      const result = fn(sum, avg, max, min, last, count, initialValue);
      return typeof result === 'number' && !Number.isNaN(result) ? result : initialValue;
    } catch {
      return initialValue;
    }
  }

  // ============ §5.5 OKR 70 分哲学引导 ============

  /**
   * OKR 评分哲学：70 分是健康的 OKR 分数
   * - 0-40：目标可能过于激进，需重新评估可行性
   * - 40-60：有挑战性，建议调整执行策略
   * - 60-80：健康区间（70 分是理想分数）
   * - 80-100：目标可能不够有挑战性，下次可适当提高
   */
  getScoreGuidance(score: number): { level: string; message: string; color: string } {
    if (score < 40) {
      return {
        level: 'aggressive',
        message: '分数偏低，目标可能过于激进。建议复盘可行性分析，适当调整目标或拆解为更小的 KR。',
        color: '#f56c6c',
      };
    } else if (score < 60) {
      return {
        level: 'challenging',
        message: '有一定挑战。建议检查执行策略，是否需要增加资源投入或调整计划。',
        color: '#e6a23c',
      };
    } else if (score < 80) {
      return {
        level: 'healthy',
        message: '健康区间。70 分左右是 OKR 的理想分数，说明目标既有挑战性又可达成。',
        color: '#67c23a',
      };
    } else if (score < 100) {
      return {
        level: 'conservative',
        message: '分数较高，目标可能不够有挑战性。下个周期可考虑提高目标难度。',
        color: '#409eff',
      };
    } else {
      return {
        level: 'perfect',
        message: '满分完成。建议下个周期设置更具挑战性的目标，推动持续成长。',
        color: '#909399',
      };
    }
  }

  // ============ 周期时间自动绑定 ============

  /**
   * 计算一组目标的周期时间
   * 开始 = 最早目标的 startAt（00:00:00）
   * 结束 = 最晚目标的 endAt（23:59:59）
   */
  computeCycleTimeBoundaries(
    objectives: { startAt: Date | null; endAt: Date | null }[],
  ): { startAt: Date; endAt: Date } | null {
    const valid = objectives.filter((o) => o.startAt && o.endAt);
    if (valid.length === 0) return null;

    const startAt = valid.reduce(
      (min, o) => (o.startAt! < min ? o.startAt! : min),
      valid[0].startAt!,
    );
    const endAt = valid.reduce(
      (max, o) => (o.endAt! > max ? o.endAt! : max),
      valid[0].endAt!,
    );

    // 开始时间设为当日 00:00:00
    const startBound = dayjs(startAt).startOf('day').toDate();
    // 结束时间设为当日 23:59:59（含结束日当天）
    const endBound = dayjs(endAt).endOf('day').toDate();

    return { startAt: startBound, endAt: endBound };
  }
}
