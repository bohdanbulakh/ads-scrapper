import { DRIZZLE, type DrizzleDatabase } from '@/database/database.constants';
import { Inject, Injectable } from '@nestjs/common';
import {
  publisher,
  PublisherInsertModel,
  PublisherSelectModel,
} from '@/database/schema';
import { AdsFileFetchStatus } from '@/database/schema/ads-file-fetch-status';
import { asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';

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
            .where(
              or(
                lte(publisher.nextToFetchFile, sql`now()`),
                isNull(publisher.nextToFetchFile),
              ),
            )
            .orderBy(asc(publisher.nextToFetchFile))
            .limit(limit)
            .for('update', { skipLocked: true }),
        ),
      )
      .returning({ id: publisher.id, domain: publisher.domain });
  }

  async upsertByDomain(data: PublisherInsertModel): Promise<string> {
    const [{ id }] = await this.db
      .insert(publisher)
      .values(data)
      .onConflictDoUpdate({
        target: publisher.domain,
        set: { name: data.name },
      })
      .returning({ id: publisher.id });

    return id;
  }

  async markFileFetched(id: string, status: AdsFileFetchStatus): Promise<void> {
    await this.db
      .update(publisher)
      .set({
        fileFetchStatus: status,
        lastFetchedFile: sql`now()`,
        nextToFetchFile: sql`now() + interval '1 day'`,
      })
      .where(eq(publisher.id, id));
  }
}
