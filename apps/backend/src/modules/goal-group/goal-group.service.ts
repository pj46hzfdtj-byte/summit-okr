import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AlgorithmService } from '../../shared/algorithm.service';
import type { GoalGroup, CreateGoalGroupDto, UpdateGoalGroupDto } from '@summit-okr/api-types';

@Injectable()
export class GoalGroupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly algorithm: AlgorithmService,
  ) {}

  /**
   * 获取目标节点树（递归）
   * 始终附带 objectives 与统计（objectiveCount / progress），供侧边栏展示
   */
  async getTree(userId: string, includeObjectives = false): Promise<GoalGroup[]> {
    const rootGroups = await this.prisma.goalGroup.findMany({
      where: { userId, parentId: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        vision: true,
        objectives: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' as const },
          include: {
            keyResults: {
              where: { deletedAt: null },
              include: { records: { orderBy: { recordedAt: 'asc' as const } } },
            },
          },
        },
      },
    });

    return Promise.all(
      rootGroups.map((g) => this.fillChildren(g, includeObjectives)),
    ) as unknown as Promise<GoalGroup[]>;
  }

  /** 计算单个目标完成度（0-1） */
  private scoreObjective(objective: any): number {
    return this.algorithm.computeObjectiveScore(
      (objective.keyResults ?? []).map((kr: any) => ({
        weight: kr.weight,
        currentValue: kr.currentValue,
        initialValue: kr.initialValue,
        targetValue: kr.targetValue,
        calculationType: kr.calculationType,
        customFormula: kr.customFormula,
        records: (kr.records ?? []).map((r: any) => ({
          value: r.value,
          recordedAt: r.recordedAt,
        })),
        minRecordCount: kr.minRecordCount,
      })),
    );
  }

  private async fillChildren(group: any, includeObjectives: boolean): Promise<GoalGroup> {
    const children = await this.prisma.goalGroup.findMany({
      where: { parentId: group.id },
      orderBy: { sortOrder: 'asc' },
      include: {
        objectives: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: {
            keyResults: {
              where: { deletedAt: null },
              include: { records: { orderBy: { recordedAt: 'asc' } } },
            },
          },
        },
      },
    });

    const filledChildren = await Promise.all(
      children.map((c: any) => this.fillChildren(c, includeObjectives)),
    );

    // 统计：子树目标数 + 平均进度
    const ownObjectives = group.objectives ?? [];
    const ownCount = ownObjectives.length;
    const ownScoreSum = ownObjectives.reduce(
      (s: number, o: any) => s + this.scoreObjective(o),
      0,
    );
    const childCount = filledChildren.reduce(
      (s: number, c: any) => s + (c.objectiveCount ?? 0),
      0,
    );
    const childScoreSum = filledChildren.reduce(
      (s: number, c: any) => s + (c.progress ?? 0) * (c.objectiveCount ?? 0),
      0,
    );
    const objectiveCount = ownCount + childCount;
    const progress =
      objectiveCount > 0 ? (ownScoreSum + childScoreSum) / objectiveCount : 0;

    const result: any = {
      ...group,
      children: filledChildren,
      objectiveCount,
      progress,
    };
    // includeObjectives=false 时保持原行为：不下发目标明细（统计仍保留）
    if (!includeObjectives) {
      result.objectives = undefined;
      for (const c of result.children) {
        if (c.objectives) c.objectives = undefined;
      }
    }
    return result as GoalGroup;
  }

  async create(userId: string, dto: CreateGoalGroupDto): Promise<GoalGroup> {
    // 计算 sortOrder（同级末尾）
    const siblings = await this.prisma.goalGroup.count({
      where: { userId, parentId: dto.parentId ?? null },
    });

    // visionId 仅在根节点（parentId 为空）时生效
    const parentId = dto.parentId ?? null;
    const visionId = parentId ? null : (dto.visionId ?? null);
    if (visionId) {
      const vision = await this.prisma.vision.findFirst({
        where: { id: visionId, userId },
      });
      if (!vision) throw new NotFoundException('愿景不存在');
    }

    const group = await this.prisma.goalGroup.create({
      data: {
        userId,
        parentId,
        visionId,
        name: dto.name,
        color: dto.color ?? '#409EFF',
        sortOrder: siblings,
      },
    });
    return group;
  }

  async update(id: string, userId: string, dto: UpdateGoalGroupDto): Promise<GoalGroup> {
    const existing = await this.checkOwnership(id, userId);
    const data: any = { ...dto };
    // visionId 仅根节点可持有
    if (dto.visionId !== undefined) {
      const parentId = dto.parentId !== undefined ? dto.parentId : existing.parentId;
      if (parentId) data.visionId = null;
      else if (dto.visionId) {
        const vision = await this.prisma.vision.findFirst({
          where: { id: dto.visionId, userId },
        });
        if (!vision) throw new NotFoundException('愿景不存在');
      }
    }
    return this.prisma.goalGroup.update({ where: { id }, data });
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.checkOwnership(id, userId);
    // 级联删除子节点 + 目标（Prisma onDelete: Cascade 已配置）
    await this.prisma.goalGroup.delete({ where: { id } });
  }

  async reorder(userId: string, ids: string[]): Promise<void> {
    await Promise.all(
      ids.map((id, index) =>
        this.prisma.goalGroup.updateMany({
          where: { id, userId },
          data: { sortOrder: index },
        }),
      ),
    );
  }

  private async checkOwnership(id: string, userId: string): Promise<GoalGroup> {
    const g = await this.prisma.goalGroup.findUnique({ where: { id } });
    if (!g || g.userId !== userId)
      throw new NotFoundException('目标节点不存在');
    return g as unknown as GoalGroup;
  }
}
