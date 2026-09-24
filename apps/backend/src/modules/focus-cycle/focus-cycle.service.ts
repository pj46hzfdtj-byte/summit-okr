import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AlgorithmService } from '../../shared/algorithm.service';
import type { FocusCycle, CreateFocusCycleDto, UpdateFocusCycleDto } from '@summit-okr/api-types';
import dayjs from 'dayjs';

@Injectable()
export class FocusCycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly algorithm: AlgorithmService,
  ) {}

  /**
   * 获取当前活跃专注周期（全局唯一）
   */
  async getActive(userId: string): Promise<any> {
    const cycle = await this.prisma.focusCycle.findFirst({
      where: { userId, isActive: true },
      include: {
        objectives: {
          include: {
            objective: {
              include: {
                keyResults: {
                  where: { deletedAt: null },
                  include: { records: { orderBy: { recordedAt: 'asc' } } },
                },
              },
            },
          },
        },
      },
    });
    if (!cycle) return null;

    // 目标被删除（回收站）时跳过该关联（to-one include 不支持 where，故在应用层过滤）
    const linked = cycle.objectives.filter(
      (oco: any) => oco.objective && !oco.objective.deletedAt,
    );

    // 计算周期得分 + 每个目标的完成度
    const objectivesWithScore = linked.map((oco: any) => {
      const score = this.algorithm.computeObjectiveScore(
        oco.objective.keyResults.map((kr: any) => ({
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
      return { ...oco, objective: { ...oco.objective, currentProgress: score } };
    });

    const cycleScore = this.algorithm.computeCycleScore(
      objectivesWithScore.map((o) => ({
        objectiveId: o.objectiveId,
        weight: o.weight,
        score: o.objective.currentProgress,
      })),
    );

    return {
      ...cycle,
      objectives: objectivesWithScore,
      cycleScore,
    };
  }

  async create(userId: string, dto: CreateFocusCycleDto): Promise<FocusCycle> {
    // 校验：同一用户全局只能有一个活跃周期
    const active = await this.prisma.focusCycle.findFirst({
      where: { userId, isActive: true },
    });
    if (active) {
      throw new BadRequestException('当前已有活跃专注周期，请先结束再创建新周期');
    }

    // 校验：所有目标存在且可加入（有计划时间 + 未结束 + 未曾加入）
    const objectives = await this.prisma.objective.findMany({
      where: { id: { in: dto.objectiveIds }, userId },
    });
    if (objectives.length !== dto.objectiveIds.length) {
      throw new BadRequestException('部分目标不存在');
    }
    const invalid = objectives.filter(
      (o) => !o.startAt || !o.endAt || o.status === 'completed',
    );
    if (invalid.length) {
      throw new BadRequestException('部分目标未计划或已结束，无法加入专注周期');
    }

    // 校验：从未加入过专注周期
    const previous = await this.prisma.focusCycleObjective.findMany({
      where: { objectiveId: { in: dto.objectiveIds } },
    });
    if (previous.length) {
      throw new BadRequestException('部分目标曾加入过专注周期（一次性规则）');
    }

    // 计算周期时间：优先使用用户手动指定的起止（B5.5），否则自动计算
    let startAt: Date;
    let endAt: Date;
    if (dto.startAt && dto.endAt) {
      startAt = dayjs(dto.startAt).startOf('day').toDate();
      endAt = dayjs(dto.endAt).endOf('day').toDate();
      if (endAt <= startAt) {
        throw new BadRequestException('结束时间必须晚于开始时间');
      }
    } else {
      const boundaries = this.algorithm.computeCycleTimeBoundaries(
        objectives.map((o) => ({
          startAt: o.startAt,
          endAt: o.endAt,
        })) as any,
      );
      if (!boundaries) {
        throw new BadRequestException('无法计算周期时间，请检查目标时间');
      }
      startAt = boundaries.startAt;
      endAt = boundaries.endAt;
    }

    return this.prisma.focusCycle.create({
      data: {
        userId,
        name: dto.name,
        startAt,
        endAt,
        isActive: true,
        objectives: {
          create: dto.objectiveIds.map((id) => ({
            objectiveId: id,
            weight: dto.weights?.[id] ?? 100,
          })),
        },
      },
      include: { objectives: true },
    }) as Promise<FocusCycle>;
  }

  /**
   * B5.5: 更新活跃周期的名称/起止时间
   */
  async update(cycleId: string, userId: string, dto: UpdateFocusCycleDto): Promise<FocusCycle> {
    const cycle = await this.prisma.focusCycle.findFirst({
      where: { id: cycleId, userId },
    });
    if (!cycle) throw new NotFoundException('专注周期不存在');
    if (!cycle.isActive) {
      throw new BadRequestException('已结束的周期不可编辑');
    }

    const data: { name?: string; startAt?: Date; endAt?: Date } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.startAt) data.startAt = dayjs(dto.startAt).startOf('day').toDate();
    if (dto.endAt) data.endAt = dayjs(dto.endAt).endOf('day').toDate();

    if (data.startAt && data.endAt && data.endAt <= data.startAt) {
      throw new BadRequestException('结束时间必须晚于开始时间');
    }
    // 校验：若只改一个，与现有值对比
    const finalStart = data.startAt ?? cycle.startAt;
    const finalEnd = data.endAt ?? cycle.endAt;
    if (finalEnd <= finalStart) {
      throw new BadRequestException('结束时间必须晚于开始时间');
    }

    return this.prisma.focusCycle.update({
      where: { id: cycleId },
      data,
      include: { objectives: true },
    }) as Promise<FocusCycle>;
  }

  async updateObjectiveWeight(
    cycleId: string,
    userId: string,
    objectiveId: string,
    weight: number,
  ): Promise<void> {
    const cycle = await this.prisma.focusCycle.findFirst({
      where: { id: cycleId, userId },
    });
    if (!cycle) throw new NotFoundException('专注周期不存在');

    await this.prisma.focusCycleObjective.update({
      where: { focusCycleId_objectiveId: { focusCycleId: cycleId, objectiveId } },
      data: { weight },
    });
  }

  async endCycle(cycleId: string, userId: string): Promise<void> {
    const cycle = await this.prisma.focusCycle.findFirst({
      where: { id: cycleId, userId },
    });
    if (!cycle) throw new NotFoundException('专注周期不存在');
    await this.prisma.focusCycle.update({
      where: { id: cycleId },
      data: { isActive: false },
    });
  }
}
