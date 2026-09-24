import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AlgorithmService } from '../../shared/algorithm.service';
import type { Vision, CreateVisionDto, UpdateVisionDto, VisionStatus } from '@summit-okr/api-types';
import dayjs from 'dayjs';

@Injectable()
export class VisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly algorithm: AlgorithmService,
  ) {}

  /**
   * 根据用户生日和愿景年龄段自动计算状态
   * - 未设生日或未设年龄段 → upcoming
   * - 当前年龄 < startAge → upcoming
   * - startAge <= 当前年龄 <= endAge → in_progress
   * - 当前年龄 > endAge → expired（除非已手动标记 achieved）
   */
  private computeStatus(
    startAge: number | null | undefined,
    endAge: number | null | undefined,
    birthDate: Date | null,
    currentStatus: string,
  ): VisionStatus {
    if (currentStatus === 'achieved') return 'achieved';
    if (!birthDate || startAge == null || endAge == null) return 'upcoming';
    const age = dayjs().diff(dayjs(birthDate), 'year');
    if (age < startAge) return 'upcoming';
    if (age > endAge) return 'expired';
    return 'in_progress';
  }

  /** 收集愿景树（根节点 visionId 匹配 + 其所有后代节点）的节点 id */
  private async collectTreeGroupIds(userId: string, visionId: string): Promise<string[]> {
    const all = await this.prisma.goalGroup.findMany({
      where: { userId },
      select: { id: true, parentId: true, visionId: true },
    });
    const roots = all.filter((g) => g.visionId === visionId).map((g) => g.id);
    const ids = new Set<string>(roots);
    let grew = true;
    while (grew) {
      grew = false;
      for (const g of all) {
        if (g.parentId && ids.has(g.parentId) && !ids.has(g.id)) {
          ids.add(g.id);
          grew = true;
        }
      }
    }
    return [...ids];
  }

  /** 愿景树下的所有未删除目标 */
  private async findTreeObjectives(userId: string, visionId: string) {
    const groupIds = await this.collectTreeGroupIds(userId, visionId);
    if (groupIds.length === 0) return [];
    return this.prisma.objective.findMany({
      where: { goalGroupId: { in: groupIds }, deletedAt: null },
    });
  }

  /** 计算愿景关联目标的平均进度（仅统计进行中的目标） */
  private async computeProgress(userId: string, visionId: string): Promise<number> {
    const objectives = await this.prisma.objective.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['completed'] },
        goalGroupId: { in: await this.collectTreeGroupIds(userId, visionId) },
      },
      include: {
        keyResults: {
          where: { deletedAt: null },
          include: { records: { select: { value: true, recordedAt: true } } },
        },
      },
    });

    if (objectives.length === 0) return 0;

    const scores = objectives.map((obj) => {
      const krs = obj.keyResults.map((kr) => ({
        weight: kr.weight,
        currentValue: this.algorithm.computeCurrentValue(
          kr.records.map((r) => ({ value: r.value, recordedAt: r.recordedAt })),
          kr.calculationType as any,
          kr.initialValue,
          kr.customFormula,
        ),
        initialValue: kr.initialValue,
        targetValue: kr.targetValue,
        calculationType: kr.calculationType as any,
        customFormula: kr.customFormula,
        records: kr.records.map((r) => ({ value: r.value, recordedAt: r.recordedAt })),
        minRecordCount: kr.minRecordCount,
      }));
      return this.algorithm.computeObjectiveScore(krs);
    });

    return scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }

  /** 为单条 Vision 附加自动计算的状态 + 关联目标进度 */
  private async withComputed(v: any, birthDate: Date | null): Promise<Vision> {
    const status = this.computeStatus(v.startAge, v.endAge, birthDate, v.status);
    if (status !== v.status) {
      await this.prisma.vision.update({ where: { id: v.id }, data: { status } }).catch(() => {});
    }
    const progress = await this.computeProgress(v.userId, v.id);
    return { ...v, status, progress } as unknown as Vision;
  }

  async list(userId: string): Promise<Vision[]> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { birthDate: true } });
    const birthDate = user?.birthDate ?? null;
    const visions = await this.prisma.vision.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      visions.map(async (v) => {
        const objectives = await this.findTreeObjectives(userId, v.id);
        const withObjs = {
          ...v,
          objectives: objectives
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((o) => ({ id: o.id, title: o.title, status: o.status, color: o.color })),
        };
        return this.withComputed(withObjs, birthDate);
      }),
    );
  }

  async create(userId: string, dto: CreateVisionDto): Promise<Vision> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { birthDate: true } });
    const birthDate = user?.birthDate ?? null;
    const status = this.computeStatus(dto.startAge, dto.endAge, birthDate, 'upcoming');
    const vision = await this.prisma.vision.create({
      data: { ...dto, userId, status },
    });
    // 方案A：愿景即目标库树的根，自动创建同名根节点
    const siblings = await this.prisma.goalGroup.count({
      where: { userId, parentId: null },
    });
    await this.prisma.goalGroup.create({
      data: {
        userId,
        parentId: null,
        visionId: vision.id,
        name: dto.content.slice(0, 20),
        color: '#8B5CF6',
        sortOrder: siblings,
      },
    });
    return vision as unknown as Vision;
  }

  async update(id: string, userId: string, dto: UpdateVisionDto): Promise<Vision> {
    const v = await this.prisma.vision.findFirst({ where: { id, userId } });
    if (!v) throw new NotFoundException('愿景不存在');

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { birthDate: true } });
    const birthDate = user?.birthDate ?? null;
    const newStatus = this.computeStatus(
      dto.startAge ?? v.startAge,
      dto.endAge ?? v.endAge,
      birthDate,
      v.status,
    );

    return this.prisma.vision.update({
      where: { id },
      data: { ...dto, status: newStatus },
    }) as unknown as Promise<Vision>;
  }

  async markAchieved(id: string, userId: string): Promise<Vision> {
    const v = await this.prisma.vision.findFirst({ where: { id, userId } });
    if (!v) throw new NotFoundException('愿景不存在');
    return this.prisma.vision.update({
      where: { id },
      data: { status: 'achieved' },
    }) as unknown as Promise<Vision>;
  }

  async resetStatus(id: string, userId: string): Promise<Vision> {
    const v = await this.prisma.vision.findFirst({ where: { id, userId } });
    if (!v) throw new NotFoundException('愿景不存在');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { birthDate: true } });
    const birthDate = user?.birthDate ?? null;
    const status = this.computeStatus(v.startAge, v.endAge, birthDate, 'upcoming');
    return this.prisma.vision.update({
      where: { id },
      data: { status },
    }) as unknown as Promise<Vision>;
  }

  async delete(id: string, userId: string): Promise<void> {
    const v = await this.prisma.vision.findFirst({ where: { id, userId } });
    if (!v) throw new NotFoundException('愿景不存在');
    // 方案A：愿景是目标库树的根。删除愿景时先摘除根节点归属（保留树与目标），再删愿景
    await this.prisma.goalGroup.updateMany({
      where: { visionId: id },
      data: { visionId: null },
    });
    await this.prisma.vision.delete({ where: { id } });
  }
}
