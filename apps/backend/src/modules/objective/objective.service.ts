import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AlgorithmService } from '../../shared/algorithm.service';
import type {
  Objective,
  CreateObjectiveDto,
  UpdateObjectiveDto,
  ObjectiveStatus,
} from '@summit-okr/api-types';

const STATUS_FLOW: Record<ObjectiveStatus, ObjectiveStatus[]> = {
  unplanned: ['not_started'],
  not_started: ['in_progress'],
  in_progress: ['pending_review', 'completed'],
  pending_review: ['completed', 'in_progress'], // 删除复盘可回退
  completed: ['pending_review'],
};

@Injectable()
export class ObjectiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly algorithm: AlgorithmService,
  ) {}

  /**
   * 自动状态机：根据当前时间和数据自动判定状态
   * - 无 startAt/endAt 或无 KR → unplanned
   * - now < startAt → not_started
   * - startAt < now < endAt → in_progress
   * - now > endAt → pending_review
   */
  async refreshStatus(objectiveId: string): Promise<ObjectiveStatus> {
    const obj = await this.prisma.objective.findUnique({
      where: { id: objectiveId },
      include: { keyResults: { select: { id: true } } },
    });
    if (!obj) return 'unplanned';

    let status: ObjectiveStatus;
    if (!obj.startAt || !obj.endAt || obj.keyResults.length === 0) {
      status = 'unplanned';
    } else {
      const now = new Date();
      const start = obj.startAt;
      const end = obj.endAt;
      if (now < start) status = 'not_started';
      else if (now > end) status = 'pending_review';
      else status = 'in_progress';
    }

    // 已复盘状态不被自动覆盖
    if (obj.status !== 'completed' && obj.status !== status) {
      await this.prisma.objective.update({
        where: { id: objectiveId },
        data: { status },
      });
    }
    return status;
  }

  async list(
    userId: string,
    query: {
      goalGroupId?: string;
      status?: ObjectiveStatus;
      page?: number;
      pageSize?: number;
      includeProgress?: boolean;
    },
  ): Promise<{ list: any[]; total: number }> {
    const where = {
      userId,
      deletedAt: null,
      ...(query.goalGroupId ? { goalGroupId: query.goalGroupId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [list, total] = await Promise.all([
      this.prisma.objective.findMany({
        where,
        include: {
          goalGroup: { select: { id: true, name: true, color: true, visionId: true } },
          keyResults: {
            where: { deletedAt: null },
            include: { records: { orderBy: { recordedAt: 'asc' } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 20),
        take: query.pageSize ?? 20,
      }),
      this.prisma.objective.count({ where }),
    ]);

    const items = list.map((o) => {
      const progress = this.algorithm.computeObjectiveScore(
        o.keyResults.map((kr) => ({
          weight: kr.weight,
          currentValue: kr.currentValue,
          initialValue: kr.initialValue,
          targetValue: kr.targetValue,
          calculationType: kr.calculationType as any,
          customFormula: kr.customFormula,
          records: kr.records.map((r) => ({
            value: r.value,
            recordedAt: r.recordedAt,
          })),
          minRecordCount: kr.minRecordCount,
        })),
      );
      const expected = this.algorithm.computeExpectedProgress(o.startAt, o.endAt);
      const isLagging = this.algorithm.isLagging(
        o.startAt,
        o.endAt,
        progress,
      );
      const { keyResults, ...rest } = o;
      return {
        ...rest,
        currentProgress: progress,
        expectedProgress: expected,
        isLagging,
        keyResultCount: keyResults.length,
      };
    });

    return { list: items, total };
  }

  async getById(id: string, userId: string): Promise<any> {
    const obj = await this.prisma.objective.findFirst({
      where: { id, userId, deletedAt: null },
      include: {
        goalGroup: { select: { id: true, name: true, color: true, visionId: true } },
        keyResults: {
          where: { deletedAt: null },
          include: { records: { orderBy: { recordedAt: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
        reviews: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!obj) throw new NotFoundException('目标不存在');

    const progress = this.algorithm.computeObjectiveScore(
      obj.keyResults.map((kr) => ({
        weight: kr.weight,
        currentValue: kr.currentValue,
        initialValue: kr.initialValue,
        targetValue: kr.targetValue,
        calculationType: kr.calculationType as any,
        customFormula: kr.customFormula,
        records: kr.records.map((r) => ({
          value: r.value,
          recordedAt: r.recordedAt,
        })),
        minRecordCount: kr.minRecordCount,
      })),
    );
    const expected = this.algorithm.computeExpectedProgress(obj.startAt, obj.endAt);
    const isLagging = this.algorithm.isLagging(obj.startAt, obj.endAt, progress);

    return {
      ...obj,
      currentProgress: progress,
      expectedProgress: expected,
      isLagging,
    };
  }

  async create(userId: string, dto: CreateObjectiveDto): Promise<Objective> {
    // 校验 goalGroupId 归属当前用户
    const group = await this.prisma.goalGroup.findFirst({
      where: { id: dto.goalGroupId, userId },
    });
    if (!group) throw new BadRequestException('目标节点不存在');

    const { visionId: _legacy, ...rest } = dto as CreateObjectiveDto & {
      visionId?: string | null;
    };
    return this.prisma.objective.create({
      data: {
        ...rest,
        userId,
        motivations: dto.motivations ?? [],
        feasibilities: dto.feasibilities ?? [],
        startAt: dto.startAt ? new Date(dto.startAt) : null,
        endAt: dto.endAt ? new Date(dto.endAt) : null,
      },
    }) as unknown as Promise<Objective>;
  }

  async update(id: string, userId: string, dto: UpdateObjectiveDto): Promise<Objective> {
    const obj = await this.prisma.objective.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!obj) throw new NotFoundException('目标不存在');

    // 已复盘状态不可编辑
    if (obj.status === 'completed') {
      throw new BadRequestException('已复盘目标只读，需删除复盘记录后才能修改');
    }

    const { visionId: _legacy, ...rest } = dto as UpdateObjectiveDto & {
      visionId?: string | null;
    };
    const data: any = { ...rest };
    if (dto.startAt !== undefined) {
      data.startAt = dto.startAt ? new Date(dto.startAt) : null;
    }
    if (dto.endAt !== undefined) {
      data.endAt = dto.endAt ? new Date(dto.endAt) : null;
    }

    const updated = await this.prisma.objective.update({
      where: { id },
      data,
    });

    // 自动刷新状态
    await this.refreshStatus(id);
    return updated as unknown as Objective;
  }

  async delete(id: string, userId: string): Promise<void> {
    const obj = await this.prisma.objective.findFirst({ where: { id, userId, deletedAt: null } });
    if (!obj) throw new NotFoundException('目标不存在');
    // 软删除：进入回收站，30 天内可恢复
    // 级联软删其下 KR（使用相同 deletedAt，便于恢复时识别级联关系）
    const deletedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.objective.update({
        where: { id },
        data: { deletedAt },
      }),
      this.prisma.keyResult.updateMany({
        where: { objectiveId: id, deletedAt: null },
        data: { deletedAt },
      }),
    ]);
  }
}
