import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import type { RecycleItem, RecycleEntityType } from '@summit-okr/api-types';

const DAY_MS = 86400000;
const RETENTION_DAYS = 30;

@Injectable()
export class RecycleService {
  constructor(private readonly prisma: PrismaService) {}

  /** 回收站列表（惰性清理：超过 30 天的自动物理删除） */
  async list(userId: string): Promise<RecycleItem[]> {
    await this.purgeExpired(userId);

    const [objectives, krs, tasks] = await Promise.all([
      this.prisma.objective.findMany({
        where: { userId, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        include: { goalGroup: { select: { name: true } } },
      }),
      this.prisma.keyResult.findMany({
        where: { deletedAt: { not: null }, objective: { userId } },
        orderBy: { deletedAt: 'desc' },
        include: { objective: { select: { title: true } } },
      }),
      this.prisma.task.findMany({
        where: { userId, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
      }),
    ]);

    const items: RecycleItem[] = [
      ...objectives.map((o: any) => ({
        id: o.id,
        entityType: 'objective' as RecycleEntityType,
        title: o.title,
        meta: o.goalGroup?.name,
        deletedAt: o.deletedAt,
      })),
      ...krs.map((kr: any) => ({
        id: kr.id,
        entityType: 'key_result' as RecycleEntityType,
        title: kr.title,
        meta: kr.objective?.title,
        deletedAt: kr.deletedAt,
      })),
      ...tasks.map((t: any) => ({
        id: t.id,
        entityType: 'task' as RecycleEntityType,
        title: t.title,
        deletedAt: t.deletedAt,
      })),
    ];
    items.sort(
      (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
    );
    return items;
  }

  /** 恢复：目标/KR/任务置回 deletedAt=null */
  async restore(userId: string, entityType: RecycleEntityType, id: string): Promise<void> {
    switch (entityType) {
      case 'objective': {
        const o = await this.prisma.objective.findFirst({ where: { id, userId } });
        if (!o) throw new NotFoundException('条目不存在');
        if (!o.deletedAt) throw new BadRequestException('该条目未删除');
        // 级联恢复：与目标同时被软删的 KR（级联删除标记）一并恢复
        await this.prisma.$transaction([
          this.prisma.objective.update({ where: { id }, data: { deletedAt: null } }),
          this.prisma.keyResult.updateMany({
            where: { objectiveId: id, deletedAt: o.deletedAt },
            data: { deletedAt: null },
          }),
        ]);
        break;
      }
      case 'key_result': {
        const kr = await this.prisma.keyResult.findFirst({
          where: { id, objective: { userId } },
        });
        if (!kr) throw new NotFoundException('条目不存在');
        if (!kr.deletedAt) throw new BadRequestException('该条目未删除');
        // 所属目标也被删除时提示先恢复目标（KR 挂在目标下，目标恢复后 KR 自然可见）
        await this.prisma.keyResult.update({ where: { id }, data: { deletedAt: null } });
        break;
      }
      case 'task': {
        const t = await this.prisma.task.findFirst({ where: { id, userId } });
        if (!t) throw new NotFoundException('条目不存在');
        if (!t.deletedAt) throw new BadRequestException('该条目未删除');
        await this.prisma.task.update({ where: { id }, data: { deletedAt: null } });
        break;
      }
      default:
        throw new BadRequestException('未知的实体类型');
    }
  }

  /** 彻底删除（物理删除） */
  async destroy(userId: string, entityType: RecycleEntityType, id: string): Promise<void> {
    switch (entityType) {
      case 'objective': {
        const o = await this.prisma.objective.findFirst({ where: { id, userId } });
        if (!o) throw new NotFoundException('条目不存在');
        await this.prisma.objective.delete({ where: { id } });
        break;
      }
      case 'key_result': {
        const kr = await this.prisma.keyResult.findFirst({
          where: { id, objective: { userId } },
        });
        if (!kr) throw new NotFoundException('条目不存在');
        await this.prisma.keyResult.delete({ where: { id } });
        break;
      }
      case 'task': {
        const t = await this.prisma.task.findFirst({ where: { id, userId } });
        if (!t) throw new NotFoundException('条目不存在');
        await this.prisma.task.delete({ where: { id } });
        break;
      }
      default:
        throw new BadRequestException('未知的实体类型');
    }
  }

  /** 清空回收站 */
  async empty(userId: string): Promise<{ count: number }> {
    const [o, kr, t] = await Promise.all([
      this.prisma.objective.deleteMany({ where: { userId, deletedAt: { not: null } } }),
      this.prisma.keyResult.deleteMany({
        where: { deletedAt: { not: null }, objective: { userId } },
      }),
      this.prisma.task.deleteMany({ where: { userId, deletedAt: { not: null } } }),
    ]);
    return { count: o.count + kr.count + t.count };
  }

  /** 超过保留期的条目物理删除（供定时任务调用） */
  async purgeExpiredForUser(userId: string): Promise<void> {
    await this.purgeExpired(userId);
  }

  /** 超过保留期的条目物理删除 */
  private async purgeExpired(userId: string): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS);
    await Promise.all([
      this.prisma.objective.deleteMany({
        where: { userId, deletedAt: { not: null, lt: cutoff } },
      }),
      this.prisma.keyResult.deleteMany({
        where: { deletedAt: { not: null, lt: cutoff }, objective: { userId } },
      }),
      this.prisma.task.deleteMany({
        where: { userId, deletedAt: { not: null, lt: cutoff } },
      }),
    ]);
  }
}
