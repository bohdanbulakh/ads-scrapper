import {
  Global,
  Inject,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { ExtendedConfigService } from '@/common/config/extended-config.service';
import { DRIZZLE, type DrizzleDatabase } from '@/database/database.constants';
import * as schema from '@/database/schema';

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
export class DatabaseModule implements OnModuleDestroy, OnModuleInit {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  // Requires `app.enableShutdownHooks()` (see main.ts) to run on SIGTERM/SIGINT.
  async onModuleDestroy(): Promise<void> {
    await this.db.$client.end();
  }

  /**
   * `Pool` connects lazily, so reach the database once to fail at boot. The
   * error is deliberately left to propagate: an app that starts without a
   * database would accept traffic and fail every request instead.
   */
  async onModuleInit(): Promise<void> {
    // The client MUST be released: `pool.end()` waits for every checked-out
    // client, so leaking one here makes onModuleDestroy hang forever and the
    // process stop responding to SIGINT (ctrl+c).
    const client = await this.db.$client.connect();
    client.release();

    new Logger(DatabaseModule.name).log('Successfully connected to DB');
  }
}
