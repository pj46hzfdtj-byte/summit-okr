import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { NotificationModule } from '../notification/notification.module';
import { RecycleModule } from '../recycle/recycle.module';

@Module({
  imports: [ScheduleModule.forRoot(), NotificationModule, RecycleModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
