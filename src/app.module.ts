import { Module } from '@nestjs/common';

import { ConfigInfraModule } from '@/common/config/config-infra.module';
import { DatabaseModule } from '@/database/database.module';
import { QueueModule } from '@/queue/queue.module';

@Module({
  imports: [ConfigInfraModule, DatabaseModule, QueueModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
