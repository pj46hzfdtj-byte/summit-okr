import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AlgorithmService } from '../../shared/algorithm.service';
import { LlmProvider, type ChatMessage, type AiIntent } from './llm.provider';
import type {
  AiPlanGoalDto,
  AiPlanGoalResult,
  AiPlanTaskDto,
  AiPlanTaskResult,
  AiSuggestScoreResult,
  AiSuggestMotivationsDto,
  AiSuggestMotivationsResult,
  AiWeeklyReportResult,
  AiConversation,
  AiMessage,
  AiUsageStat,
} from '@summit-okr/api-types';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmProvider,
    private readonly algorithm: AlgorithmService,
  ) {}

  // ============ B5.1 AI 协助规划目标 ============
  async planGoal(userId: string, dto: AiPlanGoalDto): Promise<AiPlanGoalResult> {
    await this.checkDailyLimit(userId);
    if (!dto.goal?.trim()) throw new BadRequestException('请输入目标');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是 OKR 方法论专家。根据用户输入的大目标，输出一个 Objective 和 3-5 个 Key Results（KR）。' +
          '严格返回 JSON，格式：{"objective":{"title":string,"motivations":string[],"feasibilities":string[]},"keyResults":[{"title":string,"initialValue":number,"targetValue":number,"calculationType":"sum|final|average|max|custom","emoji":string,"weight":number}]}。' +
          'calculationType 取值：sum（累计值，如刷题数）、final（最终值，如体重）、average（平均值，如均分）、max（最大值）、custom。initialValue 通常为 0 或起点，targetValue 为目标值。weight 合计建议接近 100。',
      },
      { role: 'user', content: `大目标：${dto.goal}${dto.context ? `\n背景：${dto.context}` : ''}` },
    ];

    const { content, tokens, model, mock } = await this.llm.chat(messages, {
      jsonMode: true,
      intent: 'plan_goal',
    });

    const parsed = this.safeParse<AiPlanGoalResult>(content);
    await this.saveConversation(userId, 'plan_goal', dto.goal, content, tokens, {
      dto,
      model,
      mock,
    });
    return parsed;
  }

  // ============ B5.2 AI 协助规划任务 ============
  async planTasks(userId: string, dto: AiPlanTaskDto): Promise<AiPlanTaskResult> {
    await this.checkDailyLimit(userId);

    let contextStr = '';
    if (dto.objectiveId) {
      const obj = await this.prisma.objective.findFirst({
        where: { id: dto.objectiveId, userId },
        include: { keyResults: { include: { records: true } } },
      });
      if (!obj) throw new NotFoundException('目标不存在');
      contextStr = `目标：${obj.title}\n关键结果：\n${obj.keyResults
        .map(
          (kr) =>
            `- ${kr.title}（当前 ${kr.currentValue}/${kr.targetValue}，计算方式 ${kr.calculationType}）`,
        )
        .join('\n')}`;
    }
    if (dto.context) contextStr += `\n补充说明：${dto.context}`;
    if (!contextStr) throw new BadRequestException('请选择目标或提供上下文');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是任务规划助手。基于 OKR 目标与关键结果，拆解出 4-8 个可执行任务。' +
          '严格返回 JSON：{"tasks":[{"title":string,"description":string,"scheduledAt":string(ISO 可选),"repeatRule":"none|daily|weekly|monthly|yearly|weekdays","contribution":string(对哪个 KR 有贡献)}]}。任务应具体、可量化、可执行。',
      },
      { role: 'user', content: contextStr },
    ];

    const { content, tokens, model, mock } = await this.llm.chat(messages, {
      jsonMode: true,
      intent: 'plan_tasks',
    });

    const parsed = this.safeParse<AiPlanTaskResult>(content);
    await this.saveConversation(userId, 'plan_tasks', contextStr, content, tokens, {
      dto,
      model,
      mock,
    });
    return parsed;
  }

  // ============ B5.3 AI 复盘自动评分 ============
  async suggestScore(userId: string, objectiveId: string): Promise<AiSuggestScoreResult> {
    await this.checkDailyLimit(userId);

    const obj = await this.prisma.objective.findFirst({
      where: { id: objectiveId, userId },
      include: {
        keyResults: { include: { records: { orderBy: { recordedAt: 'asc' } } } },
      },
    });
    if (!obj) throw new NotFoundException('目标不存在');

    const krContext = obj.keyResults
      .map((kr) => {
        const records = (kr as any).records ?? [];
        const last = records.length ? records[records.length - 1].value : kr.initialValue;
        return `KR[id=${kr.id}] ${kr.title}：初始 ${kr.initialValue}，目标 ${kr.targetValue}，当前 ${kr.currentValue}（${kr.calculationType}），记录 ${records.length} 条，最近值 ${last}`;
      })
      .join('\n');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是 OKR 复盘助手。基于目标与关键结果数据，为每个 KR 给出 0-1 的评分建议（1=完成，0=未开始）和说明，并给出整体自评 selfRating（0-1）。' +
          '严格返回 JSON：{"krScores":[{"keyResultId":string,"score":number,"note":string}],"selfRating":number,"reasoning":string}。keyResultId 必须使用我提供的真实 id。遵循 70 分哲学：0.7 已属优秀。',
      },
      { role: 'user', content: `目标：${obj.title}\n${krContext}` },
    ];

    const { content, tokens, model, mock } = await this.llm.chat(messages, {
      jsonMode: true,
      intent: 'suggest_score',
    });

    const parsed = this.safeParse<AiSuggestScoreResult>(content);
    // Mock 模式下 keyResultId 为占位符，按 KR 顺序映射回真实 id
    const realIds = obj.keyResults.map((kr) => kr.id);
    parsed.krScores = parsed.krScores.map((s, i) => ({
      ...s,
      keyResultId: realIds[i] ?? s.keyResultId,
    }));

    await this.saveConversation(userId, 'suggest_score', krContext, content, tokens, {
      objectiveId,
      model,
      mock,
    });
    return parsed;
  }

  // ============ B5.4 AI 建议目标动机 ============
  async suggestMotivations(
    userId: string,
    dto: AiSuggestMotivationsDto,
  ): Promise<AiSuggestMotivationsResult> {
    await this.checkDailyLimit(userId);
    if (!dto.objectiveTitle?.trim()) throw new BadRequestException('请输入目标标题');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是动机激励助手。为用户的目标生成 5 条具体、有画面感、能激发动力的动机语句。' +
          '严格返回 JSON：{"motivations":string[]}。每条不超过 30 字，第二人称。',
      },
      {
        role: 'user',
        content: `目标：${dto.objectiveTitle}${dto.context ? `\n背景：${dto.context}` : ''}`,
      },
    ];

    const { content, tokens, model, mock } = await this.llm.chat(messages, {
      jsonMode: true,
      intent: 'suggest_motivations',
    });

    const parsed = this.safeParse<AiSuggestMotivationsResult>(content);
    await this.saveConversation(userId, 'suggest_motivations', dto.objectiveTitle, content, tokens, {
      dto,
      model,
      mock,
    });
    return parsed;
  }

  // ============ B5.10 AI 周报生成 ============
  async weeklyReport(userId: string): Promise<AiWeeklyReportResult> {
    await this.checkDailyLimit(userId);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    // 本周新增记录（按 KR 聚合）
    const records = await this.prisma.record.findMany({
      where: {
        createdAt: { gte: weekAgo },
        keyResult: { deletedAt: null, objective: { userId, deletedAt: null } },
      },
      include: {
        keyResult: {
          select: {
            id: true,
            title: true,
            initialValue: true,
            targetValue: true,
            currentValue: true,
            objectiveId: true,
            objective: { select: { title: true } },
          },
        },
      },
      orderBy: { recordedAt: 'asc' },
    });

    // 本周完成的任务
    const doneTasks = await this.prisma.task.findMany({
      where: {
        userId,
        deletedAt: null,
        status: 'completed',
        completedAt: { gte: weekAgo },
      },
      select: { title: true, objectiveId: true },
    });

    // 本周 check-in 备注
    const checkIns = await this.prisma.checkIn.findMany({
      where: { userId, weekStart: { gte: new Date(weekAgo.getTime() - 7 * 86400000) } },
      select: { note: true },
    });

    // 当前滞后目标
    const laggingObjectives = await this.prisma.objective.findMany({
      where: { userId, deletedAt: null, status: 'in_progress' },
      include: {
        keyResults: {
          where: { deletedAt: null },
          include: { records: { select: { value: true, recordedAt: true } } },
        },
      },
    });
    const laggingTitles = laggingObjectives
      .filter((o: any) => {
        const score = this.algorithm.computeObjectiveScore(
          o.keyResults.map((kr: any) => ({
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
        return this.algorithm.isLagging(o.startAt, o.endAt, score);
      })
      .map((o: any) => o.title);

    if (records.length === 0 && doneTasks.length === 0 && checkIns.length === 0) {
      throw new BadRequestException('本周没有任何记录、任务或打卡数据，无法生成周报。先去记录一些进展吧！');
    }

    // 按 KR 汇总本周记录
    const byKr = new Map<string, { title: string; objective: string; values: number[]; from: number; to: number }>();
    for (const r of records) {
      const kr = r.keyResult as any;
      const entry = byKr.get(kr.id) ?? {
        title: kr.title,
        objective: kr.objective?.title ?? '?',
        values: [] as number[],
        from: kr.initialValue,
        to: kr.targetValue,
      };
      entry.values.push(r.value);
      byKr.set(kr.id, entry);
    }

    const lines: string[] = ['## 本周记录更新'];
    for (const e of byKr.values()) {
      const sum = e.values.reduce((a, b) => a + b, 0);
      lines.push(
        `- [${e.objective}] ${e.title}：${e.values.length} 次记录（合计 ${sum}），目标区间 ${e.from} → ${e.to}`,
      );
    }
    lines.push('\n## 本周完成任务');
    for (const t of doneTasks) lines.push(`- ${t.title}`);
    lines.push('\n## 本周 Check-in 备注');
    for (const c of checkIns) if (c.note) lines.push(`- ${c.note}`);
    if (laggingTitles.length) {
      lines.push('\n## 当前滞后目标', ...laggingTitles.map((x) => `- ${x}`));
    }

    const context = lines.join('\n');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是个人 OKR 教练。基于用户本周的真实数据，生成一份简洁有力的周报。' +
          '严格返回 JSON：{"summary":string(2-3 句总体概述，第二人称),"highlights":string[](1-4 条本周亮点),"risks":string[](0-3 条风险提醒，无风险返回空数组),"nextWeek":string[](2-3 条下周建议)}。' +
          '建议要具体可执行，语气积极但诚实，遵循 70 分哲学：完成 70% 即优秀，不必苛求满分。',
      },
      { role: 'user', content: context },
    ];

    const { content, tokens, model, mock } = await this.llm.chat(messages, {
      jsonMode: true,
      intent: 'weekly_report',
    });

    const parsed = this.safeParse<AiWeeklyReportResult>(content);
    await this.saveConversation(userId, 'weekly_report', context.slice(0, 200), content, tokens, {
      model,
      mock,
    });
    return parsed;
  }

  // ============ B5.9 对话历史 ============
  async listConversations(userId: string): Promise<AiConversation[]> {
    const list = await this.prisma.aiConversation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    return list as unknown as AiConversation[];
  }

  async getConversation(userId: string, id: string): Promise<AiMessage[]> {
    const conv = await this.prisma.aiConversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conv) throw new NotFoundException('对话不存在');
    return conv.messages as unknown as AiMessage[];
  }

  // ============ B5.8 用量统计 ============
  async getUsage(userId: string): Promise<AiUsageStat> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const used = await this.prisma.aiUsage.count({
      where: { userId, createdAt: { gte: today } },
    });
    const resetAt = new Date(today);
    resetAt.setDate(resetAt.getDate() + 1);
    return { used, limit: this.llm.dailyLimit, resetAt };
  }

  // ============ 内部工具 ============
  private async checkDailyLimit(userId: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const used = await this.prisma.aiUsage.count({
      where: { userId, createdAt: { gte: today } },
    });
    if (used >= this.llm.dailyLimit) {
      throw new HttpException('今日 AI 调用已达上限', 429);
    }
  }

  private async saveConversation(
    userId: string,
    intent: AiIntent,
    userContent: string,
    assistantContent: string,
    tokens: number,
    metadata: any,
  ): Promise<void> {
    try {
      const conv = await this.prisma.aiConversation.create({
        data: {
          userId,
          title: userContent.slice(0, 20),
          intent,
          messages: {
            create: [
              { role: 'user', content: userContent, metadata: {} as any },
              {
                role: 'assistant',
                content: assistantContent,
                tokensUsed: tokens,
                metadata: metadata as any,
              },
            ],
          },
        },
      });
      await this.prisma.aiUsage.create({
        data: { userId, intent, tokensUsed: tokens, model: metadata?.model || null },
      });
      void conv;
    } catch (e) {
      // 对话历史保存失败不影响主流程
      // eslint-disable-next-line no-console
      console.error('保存 AI 对话失败:', (e as Error).message);
    }
  }

  private safeParse<T>(content: string): T {
    try {
      // 兼容模型偶尔在 JSON 外包裹 markdown 代码块
      const cleaned = content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      return JSON.parse(cleaned) as T;
    } catch {
      throw new BadRequestException('AI 返回内容解析失败，请重试');
    }
  }
}
