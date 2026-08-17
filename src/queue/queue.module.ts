import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';

import { ExtendedConfigService } from '@/common/config/extended-config.service';
import { BUNDLE_INFO_QUEUE } from '@/queue/bundle-info/bundle-info.constants';
import { BundleInfoProcessor } from '@/queue/bundle-info/bundle-info.processor';
import { BundleInfoService } from '@/queue/bundle-info/bundle-info.service';
import { ScheduleModule } from '@nestjs/schedule';
import { DaoModule } from '@/dao/dao.module';
import { TasksDispatcherService } from '@/queue/tasks-dispatcher.service';
import { AdsFileService } from '@/queue/ads-file/ads-file.service';
import { AdsFileProcessor } from '@/queue/ads-file/ads-file.processor';
import { ADS_FILE_QUEUE } from '@/queue/ads-file/ads-file.constants';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ExtendedConfigService],
      useFactory: (config: ExtendedConfigService) => ({
        connection: {
          host: config.get('redis.host'),
          port: config.get('redis.port'),
          password: config.get('redis.password'),
          db: config.get('redis.db'),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: { age: 3_600, count: 1_000 },
          removeOnFail: { age: 24 * 3_600 },
        },
      }),
    }),
    BullModule.registerQueue(
      { name: BUNDLE_INFO_QUEUE },
      { name: ADS_FILE_QUEUE },
    ),
    ScheduleModule.forRoot(),
    DaoModule,
  ],
  providers: [
    BundleInfoService,
    BundleInfoProcessor,
    AdsFileService,
    AdsFileProcessor,
    TasksDispatcherService,
  ],
  exports: [BullModule, BundleInfoService],
})
export class QueueModule {}
