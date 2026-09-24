import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

/**
 * 数据导出/导入服务
 * B4.4: JSON 全量数据导出
 * B4.5: JSON 数据导入（含冲突处理：skip/overwrite）
 */
@Injectable()
export class DataExportService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ B4.4 全量导出 ============

  async exportAll(userId: string) {
    const [
      user,
      visions,
      goalGroups,
      objectives,
      tasks,
      focusCycles,
      memos,
      reviews,
      checkIns,
      notifications,
    ] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.vision.findMany({ where: { userId } }),
      this.prisma.goalGroup.findMany({ where: { userId } }),
      // 已软删除（回收站）的数据不导出
      this.prisma.objective.findMany({
        where: { userId, deletedAt: null },
        include: {
          keyResults: {
            where: { deletedAt: null },
            include: { records: true },
          },
        },
      }),
      this.prisma.task.findMany({ where: { userId, deletedAt: null } }),
      this.prisma.focusCycle.findMany({
        where: { userId },
        include: { objectives: true },
      }),
      this.prisma.memo.findMany({ where: { userId } }),
      this.prisma.review.findMany({ where: { userId } }),
      this.prisma.checkIn.findMany({ where: { userId } }),
      this.prisma.notification.findMany({ where: { userId } }),
    ]);

    // 脱敏：移除密码哈希
    const { passwordHash, ...safeUser } = user || ({} as any);

    return {
      version: '1.1',
      exportedAt: new Date().toISOString(),
      user: safeUser,
      visions,
      goalGroups,
      objectives,
      tasks,
      focusCycles,
      memos,
      reviews,
      checkIns,
      notifications,
      stats: {
        visions: visions.length,
        goalGroups: goalGroups.length,
        objectives: objectives.length,
        keyResults: objectives.reduce((s, o) => s + o.keyResults.length, 0),
        records: objectives.reduce(
          (s, o) => s + o.keyResults.reduce((rs, kr) => rs + kr.records.length, 0),
          0,
        ),
        tasks: tasks.length,
        focusCycles: focusCycles.length,
        memos: memos.length,
        reviews: reviews.length,
        checkIns: checkIns.length,
        notifications: notifications.length,
      },
    };
  }

  // ============ B4.5 数据导入 ============

  async importAll(
    userId: string,
    data: any,
    conflictStrategy: 'skip' | 'overwrite' = 'skip',
  ) {
    if (!data || !data.version) {
      throw new BadRequestException('无效的导入文件格式');
    }

    const results = {
      visions: { created: 0, skipped: 0 },
      goalGroups: { created: 0, skipped: 0 },
      objectives: { created: 0, skipped: 0 },
      tasks: { created: 0, skipped: 0 },
      memos: { created: 0, skipped: 0 },
      checkIns: { created: 0, skipped: 0 },
      notifications: { created: 0, skipped: 0 },
    };

    // 导入顺序：愿景 → 目标节点 → 目标(+KR+记录) → 任务 → 备忘
    // 使用 ID 映射处理外键关系
    const idMap = new Map<string, string>();

    // 1. 导入愿景
    if (data.visions) {
      for (const v of data.visions) {
        const exists = await this.prisma.vision.findUnique({ where: { id: v.id } });
        if (exists) {
          if (conflictStrategy === 'skip') {
            results.visions.skipped++;
            continue;
          }
          await this.prisma.vision.delete({ where: { id: v.id } });
        }
        const newV = await this.prisma.vision.create({
          data: {
            content: v.content,
            startAge: v.startAge ?? null,
            endAge: v.endAge ?? null,
            userId,
          },
        });
        idMap.set(v.id, newV.id);
        results.visions.created++;
      }
    }

    // 2. 导入目标节点
    if (data.goalGroups) {
      // 按 sortOrder 排序，确保父节点先创建
      const sorted = [...data.goalGroups].sort((a, b) => a.sortOrder - b.sortOrder);
      for (const g of sorted) {
        const exists = await this.prisma.goalGroup.findUnique({ where: { id: g.id } });
        if (exists) {
          if (conflictStrategy === 'skip') {
            results.goalGroups.skipped++;
            continue;
          }
          await this.prisma.goalGroup.delete({ where: { id: g.id } });
        }
        const newG = await this.prisma.goalGroup.create({
          data: {
            name: g.name,
            color: g.color || '#409EFF',
            sortOrder: g.sortOrder || 0,
            parentId: g.parentId ? idMap.get(g.parentId) || null : null,
            visionId: g.visionId ? idMap.get(g.visionId) || null : null,
            userId,
          },
        });
        idMap.set(g.id, newG.id);
        results.goalGroups.created++;
      }
    }

    // 3. 导入目标（含 KR + 记录）
    if (data.objectives) {
      for (const o of data.objectives) {
        const exists = await this.prisma.objective.findUnique({ where: { id: o.id } });
        if (exists) {
          if (conflictStrategy === 'skip') {
            results.objectives.skipped++;
            continue;
          }
          await this.prisma.objective.delete({ where: { id: o.id } });
        }
        const mappedGoalGroupId = o.goalGroupId
          ? idMap.get(o.goalGroupId) || null
          : null;
        if (!mappedGoalGroupId) continue;

        const newO = await this.prisma.objective.create({
          data: {
            title: o.title,
            color: o.color || '#409EFF',
            startAt: o.startAt ? new Date(o.startAt) : null,
            endAt: o.endAt ? new Date(o.endAt) : null,
            motivations: o.motivations || [],
            feasibilities: o.feasibilities || [],
            status: o.status || 'unplanned',
            weight: o.weight || 100,
            goalGroupId: mappedGoalGroupId,
            userId,
          },
        });
        idMap.set(o.id, newO.id);

        // 导入 KR + 记录
        if (o.keyResults) {
          for (const kr of o.keyResults) {
            const newKr = await this.prisma.keyResult.create({
              data: {
                title: kr.title,
                emoji: kr.emoji || '🌟',
                initialValue: kr.initialValue || 0,
                targetValue: kr.targetValue || 0,
                currentValue: kr.currentValue || kr.initialValue || 0,
                calculationType: kr.calculationType || 'sum',
                customFormula: kr.customFormula || null,
                weight: kr.weight || 100,
                minRecordCount: kr.minRecordCount || 0,
                sortOrder: kr.sortOrder || 0,
                confidence: kr.confidence || 'on_track',
                objectiveId: newO.id,
              },
            });

            if (kr.records) {
              for (const r of kr.records) {
                await this.prisma.record.create({
                  data: {
                    value: r.value,
                    note: r.note || null,
                    recordedAt: r.recordedAt ? new Date(r.recordedAt) : new Date(),
                    keyResultId: newKr.id,
                  },
                });
              }
            }
          }
        }
        results.objectives.created++;
      }
    }

    // 4. 导入任务
    if (data.tasks) {
      for (const t of data.tasks) {
        const exists = await this.prisma.task.findUnique({ where: { id: t.id } });
        if (exists) {
          if (conflictStrategy === 'skip') {
            results.tasks.skipped++;
            continue;
          }
          await this.prisma.task.delete({ where: { id: t.id } });
        }
        await this.prisma.task.create({
          data: {
            title: t.title,
            description: t.description || null,
            status: t.status || 'pending',
            scheduledAt: t.scheduledAt ? new Date(t.scheduledAt) : null,
            completedAt: t.completedAt ? new Date(t.completedAt) : null,
            repeatRule: t.repeatRule || 'none',
            repeatEndDate: t.repeatEndDate ? new Date(t.repeatEndDate) : null,
            contribution: t.contribution || null,
            objectiveId: t.objectiveId ? idMap.get(t.objectiveId) || null : null,
            userId,
          },
        });
        results.tasks.created++;
      }
    }

    // 5. 导入备忘
    if (data.memos) {
      for (const m of data.memos) {
        const exists = await this.prisma.memo.findUnique({ where: { id: m.id } });
        if (exists) {
          if (conflictStrategy === 'skip') {
            results.memos.skipped++;
            continue;
          }
          await this.prisma.memo.delete({ where: { id: m.id } });
        }
        await this.prisma.memo.create({
          data: {
            content: m.content,
            ownerType: m.ownerType,
            ownerId: m.ownerId ? idMap.get(m.ownerId) || m.ownerId : null,
            userId,
          },
        });
        results.memos.created++;
      }
    }

    // 6. 导入每周 Check-in
    if (data.checkIns) {
      for (const c of data.checkIns) {
        const weekStart = c.weekStart ? new Date(c.weekStart) : null;
        if (!weekStart) continue;
        const exists = await this.prisma.checkIn.findFirst({
          where: { userId, weekStart },
        });
        if (exists) {
          results.checkIns.skipped++;
          continue;
        }
        await this.prisma.checkIn.create({
          data: { weekStart, note: c.note || null, userId },
        });
        results.checkIns.created++;
      }
    }

    // 7. 导入通知（按 dedupeKey 幂等）
    if (data.notifications) {
      for (const n of data.notifications) {
        if (!n.dedupeKey) continue;
        const exists = await this.prisma.notification.findFirst({
          where: { userId, dedupeKey: n.dedupeKey },
        });
        if (exists) {
          results.notifications.skipped++;
          continue;
        }
        await this.prisma.notification.create({
          data: {
            type: n.type,
            title: n.title,
            body: n.body || null,
            link: n.link || null,
            dedupeKey: n.dedupeKey,
            read: n.read ?? false,
            userId,
          },
        });
        results.notifications.created++;
      }
    }

    return {
      strategy: conflictStrategy,
      results,
      importedAt: new Date().toISOString(),
    };
  }
}
