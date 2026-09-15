import { DynamicModule, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService, NOTIFICATION_QUEUE } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';

@Module({})
export class NotificationsModule {
  static forRoot(useQueue: boolean): DynamicModule {
    return {
      module: NotificationsModule,
      global: true,
      imports: useQueue ? [BullModule.registerQueue({ name: NOTIFICATION_QUEUE })] : [],
      controllers: [NotificationsController],
      providers: useQueue
        ? [NotificationsService, NotificationsProcessor]
        : [NotificationsService],
      exports: [NotificationsService],
    };
  }
}
