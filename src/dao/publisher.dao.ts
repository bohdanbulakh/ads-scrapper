import { DRIZZLE, type DrizzleDatabase } from '@/database/database.constants';
import { Inject, Injectable } from '@nestjs/common';
import { publisher, PublisherSelectModel } from '@/database/schema';
import { asc, inArray, lte, sql } from 'drizzle-orm';

export type ExpiredPublisherSelectModel = Pick<
  PublisherSelectModel,
  'id' | 'domain'
>;

@Injectable()
export class PublisherDao {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async getExpiredPublisherDomains(
    limit: number,
  ): Promise<ExpiredPublisherSelectModel[]> {
    return await this.db
      .update(publisher)
      .set({ nextToFetchFile: sql`now() + interval '10 minutes'` })
      .where(
        inArray(
          publisher.id,
          this.db
            .select({ id: publisher.id })
            .from(publisher)
            .where(lte(publisher.nextToFetchFile, sql`now()`))
            .orderBy(asc(publisher.nextToFetchFile))
            .limit(limit)
            .for('update', { skipLocked: true }),
        ),
      )
      .returning({ id: publisher.id, domain: publisher.domain });
  }
}
