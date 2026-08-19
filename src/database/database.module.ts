import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { ExtendedConfigService } from '../common/config/extended-config.service';
import { DRIZZLE, type DrizzleDatabase } from './database.constants';
import * as schema from './schema';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ExtendedConfigService],
      useFactory: (config: ExtendedConfigService) =>
        drizzle(
          new Pool({
            connectionString: config.get('database.url'),
            // pg defaults to no timeout, so an unreachable host (as opposed to
            // a refused one) stalls the boot probe until the OS gives up —
            // ~2 minutes. Bound it so the failure is reported promptly.
            connectionTimeoutMillis: 5_000,
          }),
          { schema },
        ),
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnApplicationShutdown, OnModuleInit {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.$client.end();
  }

  async onModuleInit(): Promise<void> {
    const client = await this.db.$client.connect();
    client.release();

    new Logger(DatabaseModule.name).log('Successfully connected to DB');
  }
}
