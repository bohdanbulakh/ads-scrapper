import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bundleSource } from '@/database/schema/bundle-source';
import { publisher } from '@/database/schema/publisher';
import { relations } from 'drizzle-orm';

export const bundle = pgTable('bundles', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),

  bundleId: text('bundle_id').notNull(),
  source: bundleSource('source').notNull(),
  lastFetchedPublisher: timestamp('last_fetched_publisher'),

  publisherId: uuid('publisher_id').references(() => publisher.id, {
    onDelete: 'set null',
  }),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .$onUpdate(() => new Date()),
});

export const bundleRelations = relations(bundle, ({ one }) => ({
  publisher: one(publisher, {
    fields: [bundle.publisherId],
    references: [publisher.id],
  }),
}));
