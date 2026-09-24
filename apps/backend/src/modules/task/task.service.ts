import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import type { Task, CreateTaskDto, UpdateTaskDto, RepeatRule } from '@summit-okr/api-types';
import dayjs from 'dayjs';

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, filters: { status?: string; date?: string }): Promise<Task[]> {
    const where: any = { userId, deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (filters.date) {
      const d = new Date(filters.date);
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      where.scheduledAt = { gte: start, lte: end };
    }
    return this.prisma.task.findMany({
      where,
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
    }) as unknown as Promise<Task[]>;
  }

  async create(userId: string, dto: CreateTaskDto): Promise<Task> {
    return this.prisma.task.create({
      data: {
        ...dto,
        userId,
        objectiveId: dto.objectiveId ?? null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        repeatEndDate: dto.repeatEndDate ? new Date(dto.repeatEndDate) : null,
      },
    }) as unknown as Promise<Task>;
  }

  async update(id: string, userId: string, dto: UpdateTaskDto): Promise<Task> {
    const t = await this.prisma.task.findFirst({ where: { id, userId } });
    if (!t) throw new NotFoundException('任务不存在');
    const data: any = { ...dto };
    if (dto.scheduledAt !== undefined) {
      data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    }
    return this.prisma.task.update({ where: { id }, data }) as unknown as Promise<Task>;
  }

  /**
   * 完成/取消完成任务
   * 若任务有重复规则（repeatRule != none），完成时自动生成下一次任务
   * 取消完成时不触发重复逻辑
   */
  async complete(id: string, userId: string, completed: boolean): Promise<Task> {
    const t = await this.prisma.task.findFirst({ where: { id, userId, deletedAt: null } });
    if (!t) throw new NotFoundException('任务不存在');

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: completed ? 'completed' : 'pending',
        completedAt: completed ? new Date() : null,
      },
    });

    // 完成有重复规则的任务 → 自动生成下一次
    if (completed && t.repeatRule && t.repeatRule !== 'none') {
      await this.generateNextOccurrence(t);
    }

    return updated as unknown as Task;
  }

  async delete(id: string, userId: string): Promise<void> {
    const t = await this.prisma.task.findFirst({ where: { id, userId, deletedAt: null } });
    if (!t) throw new NotFoundException('任务不存在');
    // 软删除：进回收站
    await this.prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /**
   * 一键删除过去一周的过期未完成任务（v4.1.11）
   * 条件：status=pending 且 scheduledAt < 7天前
   */
  async deleteOverdue(userId: string): Promise<{ count: number }> {
    const weekAgo = dayjs().subtract(7, 'day').toDate();
    const result = await this.prisma.task.updateMany({
      where: {
        userId,
        deletedAt: null,
        status: 'pending',
        scheduledAt: { lt: weekAgo },
      },
      data: { deletedAt: new Date() },
    });
    return { count: result.count };
  }

  /**
   * 批量删除任务（v4.1.14）
   */
  async batchDelete(userId: string, ids: string[]): Promise<{ count: number }> {
    const result = await this.prisma.task.updateMany({
      where: { id: { in: ids }, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { count: result.count };
  }

  // ============ 重复任务引擎 ============

  /**
   * 根据重复规则计算下一次计划时间
   * @param baseDate 基准日期（当前任务的 scheduledAt）
   * @param rule 重复规则
   * @returns 下一次计划时间，若无法生成（如 weekdays 跳过周末）返回 null
   */
  private computeNextScheduledAt(baseDate: Date, rule: RepeatRule): Date | null {
    const base = dayjs(baseDate);

    switch (rule) {
      case 'daily':
        return base.add(1, 'day').toDate();

      case 'weekly':
        return base.add(7, 'day').toDate();

      case 'monthly':
        return base.add(1, 'month').toDate();

      case 'yearly':
        return base.add(1, 'year').toDate();

      case 'weekdays': {
        // 跳过周末：周五 → 下周一，其他工作日 → 次日
        const dayOfWeek = base.day(); // 0=周日, 6=周六
        if (dayOfWeek === 5) {
          // 周五 → 下周一（+3天）
          return base.add(3, 'day').toDate();
        } else if (dayOfWeek === 6) {
          // 周六 → 下周一（+2天）
          return base.add(2, 'day').toDate();
        } else {
          // 周日(0) → 周一（+1天），周一~周四 → 次日（+1天）
          return base.add(1, 'day').toDate();
        }
      }

      default:
        return null;
    }
  }

  /**
   * 生成下一次重复任务
   * 规则：
   * 1. 基于 scheduledAt 计算下一次时间
   * 2. 若超过 repeatEndDate 则停止重复
   * 3. 复制标题/描述/目标关联/重复规则，新任务状态为 pending
   */
  private async generateNextOccurrence(task: {
    userId: string;
    objectiveId: string | null;
    title: string;
    description: string | null;
    scheduledAt: Date | null;
    repeatRule: string;
    repeatEndDate: Date | null;
    contribution: string | null;
  }): Promise<void> {
    // 没有 scheduledAt 无法计算下一次时间
    if (!task.scheduledAt) return;

    const nextDate = this.computeNextScheduledAt(
      task.scheduledAt,
      task.repeatRule as RepeatRule,
    );
    if (!nextDate) return;

    // 检查是否超过 repeatEndDate
    if (task.repeatEndDate && dayjs(nextDate).isAfter(dayjs(task.repeatEndDate), 'day')) {
      return; // 超过结束日期，停止重复
    }

    // 创建下一次任务
    await this.prisma.task.create({
      data: {
        userId: task.userId,
        objectiveId: task.objectiveId,
        title: task.title,
        description: task.description,
        status: 'pending',
        scheduledAt: nextDate,
        repeatRule: task.repeatRule,
        repeatEndDate: task.repeatEndDate,
        contribution: task.contribution,
        syncedToCalendar: false,
      },
    });
  }
}
