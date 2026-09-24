import { Injectable, ServiceUnavailableException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  content: string;
  tokens: number;
  model: string;
  mock: boolean;
}

export type AiIntent =
  | 'plan_goal'
  | 'plan_tasks'
  | 'suggest_score'
  | 'suggest_motivations'
  | 'weekly_report';

/**
 * OpenAI 兼容 LLM Provider
 * 默认指向 DeepSeek；未配置 API Key 时自动启用 Mock 模式返回确定性示例数据。
 * 使用 Node 18+ 内置 fetch，无需额外依赖。
 */
@Injectable()
export class LlmProvider {
  private readonly logger = new Logger(LlmProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly mockFlag: boolean;
  readonly dailyLimit: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (
      this.config.get<string>('AI_BASE_URL') || 'https://api.deepseek.com'
    ).replace(/\/$/, '');
    this.apiKey = this.config.get<string>('AI_API_KEY') || '';
    this.model = this.config.get<string>('AI_MODEL') || 'deepseek-chat';
    this.mockFlag = this.config.get<string>('AI_MOCK') !== 'false';
    this.dailyLimit = Number(this.config.get<string>('AI_DAILY_LIMIT') || '50');
  }

  get isMockMode(): boolean {
    // 未配置 key 时强制 Mock
    return !this.apiKey || this.mockFlag;
  }

  get modelName(): string {
    return this.model;
  }

  async chat(
    messages: ChatMessage[],
    opts: { jsonMode?: boolean; intent?: AiIntent } = {},
  ): Promise<ChatResult> {
    if (this.isMockMode) {
      this.logger.warn('AI Mock 模式生效（未配置 AI_API_KEY 或 AI_MOCK=true）');
      return {
        content: this.mockResponse(opts.intent),
        tokens: 0,
        model: 'mock',
        mock: true,
      };
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: 0.7,
    };
    if (opts.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      this.logger.error(`AI 请求失败: ${(e as Error).message}`);
      throw new ServiceUnavailableException('AI 服务暂不可用');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`AI 服务返回 ${res.status}: ${text}`);
      throw new ServiceUnavailableException(`AI 服务暂不可用 (${res.status})`);
    }

    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const tokens = data?.usage?.total_tokens ?? 0;
    return { content, tokens, model: this.model, mock: false };
  }

  /**
   * Mock 模式：按意图返回固定 JSON 字符串
   */
  private mockResponse(intent?: AiIntent): string {
    switch (intent) {
      case 'plan_goal':
        return JSON.stringify({
          objective: {
            title: '考研上岸',
            motivations: ['提升学历背景', '获得更好职业机会', '追求学术兴趣'],
            feasibilities: ['每天可投入 6 小时', '有完整复习资料', '基础较好'],
          },
          keyResults: [
            { title: '英语真题完成度', initialValue: 0, targetValue: 20, calculationType: 'sum', emoji: '📚', weight: 30 },
            { title: '政治模拟卷均分', initialValue: 0, targetValue: 75, calculationType: 'average', emoji: '📝', weight: 25 },
            { title: '专业课真题得分率', initialValue: 0, targetValue: 100, calculationType: 'average', emoji: '🎯', weight: 45 },
          ],
        });
      case 'plan_tasks':
        return JSON.stringify({
          tasks: [
            { title: '背诵英语高频词汇 200 个', description: '使用艾宾浩斯记忆法', scheduledAt: undefined, repeatRule: 'daily', contribution: '英语真题完成度' },
            { title: '完成 1 套英语真题阅读', description: '限时 60 分钟，精读错题', contribution: '英语真题完成度' },
            { title: '政治章节练习 50 题', description: '马原重点章节', repeatRule: 'weekdays', contribution: '政治模拟卷均分' },
            { title: '专业课第 3 章真题演练', description: '整理错题本', contribution: '专业课真题得分率' },
          ],
        });
      case 'suggest_score':
        return JSON.stringify({
          krScores: [
            { keyResultId: '__MOCK__', score: 0.72, note: '进度略低于预期，需加快节奏' },
            { keyResultId: '__MOCK__', score: 0.65, note: '模拟卷均分仍有提升空间' },
            { keyResultId: '__MOCK__', score: 0.80, note: '专业课掌握良好' },
          ],
          selfRating: 0.7,
          reasoning: '整体进度 70%，符合 OKR 70 分哲学。英语与政治需加强，专业课表现稳定。建议增加真题训练频次。',
        });
      case 'suggest_motivations':
        return JSON.stringify({
          motivations: [
            '想象拿到录取通知书那一刻的喜悦',
            '为未来的职业选择打开更多门',
            '证明自己能在高压下坚持到底',
            '把热爱变成专业，深耕学术领域',
            '给家人一个满意的交代',
          ],
        });
      case 'weekly_report':
        return JSON.stringify({
          summary:
            '本周你保持了稳定的推进节奏，多个关键结果都有实质更新，任务完成率也不错。继续保持这种"小步快跑"的状态，比单次冲刺更有价值。',
          highlights: [
            '关键结果记录频次稳定，说明执行节奏已经成型',
            '本周任务基本清零，没有积压到下周',
            '有意识地在滞后目标上补了进度，风险处置及时',
          ],
          risks: ['部分目标临近截止日期但进度不足 70%，建议下周优先处理'],
          nextWeek: [
            '为滞后目标安排 2 个专注时段，优先补齐最大缺口',
            '周中做一次快速 check-in，避免周末才发现掉队',
            '保持 70 分哲学：完成比完美更重要',
          ],
        });
      default:
        return JSON.stringify({ message: 'mock response' });
    }
  }
}
