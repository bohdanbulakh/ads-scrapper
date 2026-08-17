import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { app } from '@/database/schema/app';

export const publisher = pgTable('publishers', {
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
  apps: many(app),
}));

export type PublisherSelectModel = typeof publisher.$inferSelect;
export type PublisherInsertModel = typeof publisher.$inferInsert;
export type PublisherUpdateModel = Partial<PublisherSelectModel>;
