import { DRIZZLE, type DrizzleDatabase } from '@/database/database.constants';
import { Inject, Injectable } from '@nestjs/common';
import { app, AppSelectModel, AppUpdateModel } from '@/database/schema';
import { asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';

export type ExpiredAppSelectModel = Pick<
  AppSelectModel,
  'id' | 'bundleId' | 'source'
>;

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
      .returning({ id: app.id, bundleId: app.bundleId, source: app.source });
  }

  async updateById(id: string, data: AppUpdateModel) {
    await this.db.update(app).set(data).where(eq(app.id, id));
  }
}
