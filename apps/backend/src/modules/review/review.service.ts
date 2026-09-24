import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AlgorithmService } from '../../shared/algorithm.service';
import type { Review, CreateReviewDto, UpdateReviewDto } from '@summit-okr/api-types';

@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly algorithm: AlgorithmService,
  ) {}

  async listByObjective(objectiveId: string, userId: string): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { objectiveId, userId },
      orderBy: { createdAt: 'desc' },
    }) as unknown as Promise<Review[]>;
  }

  async listByUser(userId: string, type?: string): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { userId, ...(type ? { type } : {}) },
      orderBy: { createdAt: 'desc' },
    }) as unknown as Promise<Review[]>;
  }

  /**
   * 创建复盘记录
   * 期末复盘 → 目标状态变为 completed（只读）
   * 期中复盘 → 目标保持 in_progress（可继续编辑，版本递增）
   */
  async create(userId: string, dto: CreateReviewDto): Promise<Review> {
    const obj = await this.prisma.objective.findFirst({
      where: { id: dto.objectiveId, userId, deletedAt: null },
    });
    if (!obj) throw new NotFoundException('目标不存在');

    if (dto.type === 'final') {
      // 期末复盘：目标必须处于 pending_review
      if (obj.status !== 'pending_review' && obj.status !== 'in_progress') {
        throw new BadRequestException('目标当前状态不允许期末复盘');
      }
      // 计算目标得分 + 70 分哲学引导
      const objectiveScore = await this.algorithm.computeObjectiveScoreFromDb(dto.objectiveId);
      const scorePercent = Math.round(objectiveScore * 100);
      const guidance = this.algorithm.getScoreGuidance(scorePercent);

      // 创建复盘 + 标记目标为 completed
      const [review] = await this.prisma.$transaction([
        this.prisma.review.create({
          data: {
            ...dto,
            userId,
            version: 1,
            objectiveScore: scorePercent,
          } as any,
        }),
        this.prisma.objective.update({
          where: { id: dto.objectiveId },
          data: { status: 'completed' },
        }),
      ]);
      return { ...review, objectiveScore: scorePercent, scoreGuidance: guidance } as unknown as Review;
    } else {
      // 期中复盘：版本号递增
      const latestVersion = await this.prisma.review.aggregate({
        where: { objectiveId: dto.objectiveId, type: 'midterm' },
        _max: { version: true },
      });
      const nextVersion = (latestVersion._max.version ?? 0) + 1;

      return this.prisma.review.create({
        data: { ...dto, userId, version: nextVersion } as any,
      }) as unknown as Promise<Review>;
    }
  }

  /**
   * 期中复盘可编辑（新版本）
   * 期末复盘不可编辑，需删除后重新创建
   */
  async update(id: string, userId: string, dto: UpdateReviewDto): Promise<Review> {
    const r = await this.prisma.review.findFirst({ where: { id, userId } });
    if (!r) throw new NotFoundException('复盘记录不存在');
    if (r.type === 'final') {
      throw new BadRequestException('期末复盘不可编辑，请删除后重新创建');
    }
    return this.prisma.review.update({ where: { id }, data: dto as any }) as unknown as Promise<Review>;
  }

  /**
   * 删除复盘记录
   * 期末复盘删除 → 目标回退到 pending_review
   */
  async delete(id: string, userId: string): Promise<void> {
    const r = await this.prisma.review.findFirst({ where: { id, userId } });
    if (!r) throw new NotFoundException('复盘记录不存在');

    await this.prisma.review.delete({ where: { id } });

    if (r.type === 'final') {
      // 目标回退到 pending_review
      await this.prisma.objective.update({
        where: { id: r.objectiveId },
        data: { status: 'pending_review' },
      });
    }
  }
}
