import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AlgorithmService } from '../../shared/algorithm.service';
import type { KeyResult, CreateKeyResultDto, UpdateKeyResultDto } from '@summit-okr/api-types';

@Injectable()
export class KeyResultService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly algorithm: AlgorithmService,
  ) {}

  async listByObjective(objectiveId: string, userId: string): Promise<KeyResult[]> {
    // 校验归属
    const obj = await this.prisma.objective.findFirst({
      where: { id: objectiveId, userId },
    });
    if (!obj) throw new NotFoundException('目标不存在');

    const krs = await this.prisma.keyResult.findMany({
      where: { objectiveId, deletedAt: null },
      include: {
        records: { orderBy: { recordedAt: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // 同步刷新每个 KR 的 currentValue（确保 DB 与 records 一致）
    await Promise.all(
      krs.map((kr) => this.algorithm.refreshKrCurrentValue(kr.id)),
    );

    // 重新查询以获取更新后的 currentValue
    return this.prisma.keyResult.findMany({
      where: { objectiveId, deletedAt: null },
      include: {
        records: { orderBy: { recordedAt: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    }) as Promise<KeyResult[]>;
  }

  async create(userId: string, dto: CreateKeyResultDto): Promise<KeyResult> {
    const obj = await this.prisma.objective.findFirst({
      where: { id: dto.objectiveId, userId },
    });
    if (!obj) throw new BadRequestException('目标不存在');

    // 已复盘状态不可添加 KR
    if (obj.status === 'completed') {
      throw new BadRequestException('已复盘目标只读，无法添加 KR');
    }

    const count = await this.prisma.keyResult.count({
      where: { objectiveId: dto.objectiveId },
    });

    const kr = await this.prisma.keyResult.create({
      data: {
        objectiveId: dto.objectiveId,
        title: dto.title,
        emoji: dto.emoji ?? '🌟',
        initialValue: dto.initialValue,
        targetValue: dto.targetValue,
        calculationType: dto.calculationType ?? 'sum',
        customFormula: dto.customFormula ?? null,
        weight: dto.weight ?? 100,
        minRecordCount: dto.minRecordCount ?? 0,
        sortOrder: count,
        currentValue: dto.initialValue,
      },
    });

    return kr as unknown as KeyResult;
  }

  async update(id: string, userId: string, dto: UpdateKeyResultDto): Promise<KeyResult> {
    await this.checkOwnership(id, userId);
    const updated = await this.prisma.keyResult.update({
      where: { id },
      data: dto,
    });

    // 修改取值方式后重新计算 currentValue
    if (
      dto.calculationType !== undefined ||
      dto.customFormula !== undefined ||
      dto.initialValue !== undefined
    ) {
      await this.algorithm.refreshKrCurrentValue(id);
    }
    return updated as unknown as KeyResult;
  }

  async delete(id: string, userId: string): Promise<void> {
    const kr = await this.checkOwnership(id, userId);
    // 软删除：进回收站
    await this.prisma.keyResult.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    void kr;
  }

  private async checkOwnership(id: string, userId: string): Promise<any> {
    const kr = await this.prisma.keyResult.findUnique({
      where: { id },
      include: { objective: true },
    });
    if (!kr || kr.objective.userId !== userId || kr.deletedAt) {
      throw new NotFoundException('关键结果不存在');
    }
    return kr;
  }
}
