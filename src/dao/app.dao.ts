import { DRIZZLE, type DrizzleDatabase } from '@/database/database.constants';
import { Inject, Injectable } from '@nestjs/common';
import { app, AppSelectModel } from '@/database/schema';
import { PublisherFetchStatus } from '@/database/schema/publisher-fetch-status';
import { and, asc, eq, inArray, isNull, lte, not, or, sql } from 'drizzle-orm';

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
      .set({ locked: true })
      .where(
        inArray(
          app.id,
          this.db
            .select({ id: app.id })
            .from(app)
            .where(
              and(
                not(app.locked),
                or(
                  lte(app.nextToFetchPublisher, sql`now()`),
                  isNull(app.nextToFetchPublisher),
                ),
              ),
            )
            .orderBy(asc(app.nextToFetchPublisher))
            .limit(limit)
            .for('update', { skipLocked: true }),
        ),
      )
      .returning({ id: app.id, bundleId: app.bundleId, source: app.source });
  }

  async markPublisherFetched(
    id: string,
    status: PublisherFetchStatus,
    publisherId?: string,
  ): Promise<void> {
    await this.db
      .update(app)
      .set({
        publisherFetchStatus: status,
        ...(publisherId ? { publisherId } : {}),
        locked: false,
        lastFetchedPublisher: sql`now()`,
        nextToFetchPublisher: sql`now() + interval '7 days'`,
      })
      .where(eq(app.id, id));
  }

  async unlockById(id: string): Promise<void> {
    await this.db.update(app).set({ locked: false }).where(eq(app.id, id));
  }
}
