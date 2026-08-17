import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { bundle } from '@/database/schema/bundle';

export const publisher = pgTable('publisher', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),

  name: text('name').notNull(),
  domain: text('domain'),
  lastFetchedFile: timestamp('last_fetched_file'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .$onUpdate(() => new Date()),
});

export const publisherRelations = relations(publisher, ({ many }) => ({
  bundles: many(bundle),
}));
