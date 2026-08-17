import { Module } from '@nestjs/common';

import { ConfigInfraModule } from '@/common/config/config-infra.module';
import { DatabaseModule } from '@/database/database.module';
import { QueueModule } from '@/queue/queue.module';
import { StorageModule } from '@/storage/storage.module';

@Module({
  imports: [ConfigInfraModule, DatabaseModule, StorageModule, QueueModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
