import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

export const prospects = pgTable(
  'prospects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    company: text('company'),
    companySize: text('company_size'),
    jobTitle: text('job_title'),
    source: text('source').notNull(),
    sourceUrl: text('source_url'),
    sourceSnippet: text('source_snippet'),
    paraphrasedComplaint: text('paraphrased_complaint'),
    smartleadId: text('smartlead_id'),
    status: text('status').notNull().default('new'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('idx_prospects_status').on(t.status),
  }),
);
