import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AlgorithmService } from '../../shared/algorithm.service';
import type { Record, CreateRecordDto, UpdateRecordDto, RecordTrendPoint } from '@summit-okr/api-types';

@Injectable()
export class RecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly algorithm: AlgorithmService,
  ) {}

  /**
   * 创建记录后会自动触发 KR currentValue 重算
   */
  async create(userId: string, dto: CreateRecordDto): Promise<Record> {
    await this.checkKrOwnership(dto.keyResultId, userId);
    const record = await this.prisma.record.create({
      data: {
        keyResultId: dto.keyResultId,
        value: dto.value,
        note: dto.note ?? null,
        recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
      },
    });

    // 触发 KR currentValue 重算
    await this.algorithm.refreshKrCurrentValue(dto.keyResultId);
    return record;
  }

  async update(id: string, userId: string, dto: UpdateRecordDto): Promise<Record> {
    const record = await this.checkOwnership(id, userId);
    const updated = await this.prisma.record.update({
      where: { id },
      data: {
        ...dto,
        recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : undefined,
      },
    });

    // 触发 KR currentValue 重算
    await this.algorithm.refreshKrCurrentValue(record.keyResultId);
    return updated;
  }

  async delete(id: string, userId: string): Promise<void> {
    const record = await this.checkOwnership(id, userId);
    await this.prisma.record.delete({ where: { id } });
    await this.algorithm.refreshKrCurrentValue(record.keyResultId);
  }

  /**
   * 趋势图数据：累计值 + 时间点
   */
  async getTrend(keyResultId: string, userId: string): Promise<RecordTrendPoint[]> {
    await this.checkKrOwnership(keyResultId, userId);
    const records = await this.prisma.record.findMany({
      where: { keyResultId },
      orderBy: { recordedAt: 'asc' },
    });

    let cumulative = 0;
    return records.map((r) => {
      cumulative += r.value;
      return {
        recordedAt: r.recordedAt.toISOString(),
        value: r.value,
        cumulativeValue: cumulative,
      };
    });
  }

  private async checkOwnership(id: string, userId: string): Promise<Record> {
    const record = await this.prisma.record.findUnique({
      where: { id },
      include: { keyResult: { include: { objective: true } } },
    });
    if (
      !record ||
      record.keyResult.objective.userId !== userId ||
      record.keyResult.deletedAt !== null ||
      record.keyResult.objective.deletedAt !== null
    ) {
      throw new NotFoundException('记录不存在');
    }
    return record;
  }

  private async checkKrOwnership(krId: string, userId: string): Promise<void> {
    const kr = await this.prisma.keyResult.findUnique({
      where: { id: krId },
      include: { objective: true },
    });
    if (
      !kr ||
      kr.objective.userId !== userId ||
      kr.deletedAt !== null ||
      kr.objective.deletedAt !== null
    ) {
      throw new NotFoundException('关键结果不存在');
    }
  }
}
