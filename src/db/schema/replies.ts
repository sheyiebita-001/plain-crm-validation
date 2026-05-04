import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { prospects } from './prospects';

export const replies = pgTable('replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  prospectId: uuid('prospect_id').references(() => prospects.id, { onDelete: 'cascade' }),
  replyText: text('reply_text').notNull(),
  classification: text('classification'),
  classifiedAt: timestamp('classified_at', { withTimezone: true }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  notes: text('notes'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});
