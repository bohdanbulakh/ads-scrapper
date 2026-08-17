import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { AppDao } from '@/dao/app.dao';
import { PublisherDao } from '@/dao/publisher.dao';

@Module({
  imports: [DatabaseModule],
  providers: [AppDao, PublisherDao],
  exports: [AppDao, PublisherDao],
})
export class DaoModule {}
