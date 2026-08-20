import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { app } from './app';
import { adsFileFetchStatus } from './enums/ads-file-fetch-status';

export const publisher = pgTable(
  'publishers',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),

    name: text('name').notNull(),
    domain: text('domain').notNull().unique(),
    nextToFetchFile: timestamp('next_to_fetch_file').notNull().defaultNow(),
    fileFetchStatus: adsFileFetchStatus('ads_file_fetch_status'),

    locked: boolean('locked').default(false).notNull(),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('publishers_next_to_fetch_file_idx')
      .on(table.nextToFetchFile)
      .where(sql`not ${table.locked}`),
  ],
);

export const publisherRelations = relations(publisher, ({ many }) => ({
  apps: many(app),
}));

export type PublisherSelectModel = typeof publisher.$inferSelect;
export type PublisherInsertModel = typeof publisher.$inferInsert;
export type PublisherUpdateModel = Partial<PublisherSelectModel>;
