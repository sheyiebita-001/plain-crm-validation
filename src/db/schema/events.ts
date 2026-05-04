import { pgTable, uuid, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { prospects } from './prospects';

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prospectId: uuid('prospect_id').references(() => prospects.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    sequenceStep: integer('sequence_step'),
    metadata: jsonb('metadata'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    prospectIdx: index('idx_events_prospect').on(t.prospectId),
    typeTimeIdx: index('idx_events_type_time').on(t.eventType, t.occurredAt),
  }),
);
