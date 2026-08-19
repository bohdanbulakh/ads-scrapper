import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { bundleSource } from './enums/bundle-source';
import { publisher } from './publisher';
import { publisherFetchStatus } from './enums/publisher-fetch-status';
import { relations, sql } from 'drizzle-orm';

export const app = pgTable(
  'apps',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),

    bundleId: text('bundle_id').notNull(),
    source: bundleSource('source').notNull(),
    lastFetchedPublisher: timestamp('last_fetched_publisher'),
    nextToFetchPublisher: timestamp('next_to_fetch_publisher')
      .notNull()
      .defaultNow(),
    publisherFetchStatus: publisherFetchStatus('publisher_fetch_status'),

    publisherId: uuid('publisher_id').references(() => publisher.id, {
      onDelete: 'set null',
    }),

    locked: boolean('locked').default(false).notNull(),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('apps_next_to_fetch_publisher_idx')
      .on(table.nextToFetchPublisher)
      .where(sql`not ${table.locked}`),
  ],
);

export const appRelations = relations(app, ({ one }) => ({
  publisher: one(publisher, {
    fields: [app.publisherId],
    references: [publisher.id],
  }),
}));

export type AppSelectModel = typeof app.$inferSelect;
export type AppInsertModel = typeof app.$inferInsert;
export type AppUpdateModel = Partial<AppSelectModel>;
