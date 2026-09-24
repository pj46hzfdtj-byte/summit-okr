import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma.module';
import { HealthModule } from './common/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { VisionModule } from './modules/vision/vision.module';
import { GoalGroupModule } from './modules/goal-group/goal-group.module';
import { ObjectiveModule } from './modules/objective/objective.module';
import { KeyResultModule } from './modules/key-result/key-result.module';
import { RecordModule } from './modules/record/record.module';
import { MemoModule } from './modules/memo/memo.module';
import { TaskModule } from './modules/task/task.module';
import { FocusCycleModule } from './modules/focus-cycle/focus-cycle.module';
import { ReviewModule } from './modules/review/review.module';
import { SummaryModule } from './modules/summary/summary.module';
import { GanttModule } from './modules/gantt/gantt.module';
import { DataExportModule } from './modules/data-export/data-export.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { AiModule } from './modules/ai/ai.module';
import { CheckinModule } from './modules/checkin/checkin.module';
import { NotificationModule } from './modules/notification/notification.module';
import { RecycleModule } from './modules/recycle/recycle.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';

@Module({
  imports: [
    // 全局配置
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.example'],
    }),
    // 限流（每分钟 100 次）
    ThrottlerModule.forRoot([
      { ttl: 60000, limit: 100 },
    ]),
    // Prisma 全局
    PrismaModule,
    // 健康检查（免登录）
    HealthModule,
    // 业务模块
    AuthModule,
    UserModule,
    VisionModule,
    GoalGroupModule,
    ObjectiveModule,
    KeyResultModule,
    RecordModule,
    MemoModule,
    TaskModule,
    FocusCycleModule,
    ReviewModule,
    SummaryModule,
    GanttModule,
    DataExportModule,
    FeedbackModule,
    AiModule,
    CheckinModule,
    NotificationModule,
    RecycleModule,
    SchedulerModule,
  ],
})
export class AppModule {}
