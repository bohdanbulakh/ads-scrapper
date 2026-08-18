import { DRIZZLE, type DrizzleDatabase } from '@/database/database.constants';
import { Inject, Injectable } from '@nestjs/common';
import { app, AppSelectModel } from '@/database/schema';
import { asc, inArray, isNull, lte, or, sql } from 'drizzle-orm';

export type ExpiredAppSelectModel = Pick<AppSelectModel, 'id' | 'bundleId'>;

@Injectable()
export class AppDao {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async getExpiredBundleIds(limit: number): Promise<ExpiredAppSelectModel[]> {
    return await this.db
      .update(app)
      .set({ nextToFetchPublisher: sql`now() + interval '10 minutes'` })
      .where(
        inArray(
          app.id,
          this.db
            .select({ id: app.id })
            .from(app)
            .where(
              or(
                lte(app.nextToFetchPublisher, sql`now()`),
                isNull(app.nextToFetchPublisher),
              ),
            )
            .orderBy(asc(app.nextToFetchPublisher))
            .limit(limit)
            .for('update', { skipLocked: true }),
        ),
      )
      .returning({ id: app.id, bundleId: app.bundleId });
  }
}
