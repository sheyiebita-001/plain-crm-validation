import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const suppressionList = pgTable('suppression_list', {
  email: text('email').primaryKey(),
  reason: text('reason').notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
});
