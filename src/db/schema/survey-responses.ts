import { pgTable, uuid, text, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { prospects } from './prospects';

export const surveyResponses = pgTable('survey_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  prospectId: uuid('prospect_id').references(() => prospects.id, { onDelete: 'set null' }),
  email: text('email').notNull(),
  name: text('name'),
  company: text('company'),
  currentCrm: text('current_crm'),
  biggestFrustration: text('biggest_frustration'),
  topFeatures: jsonb('top_features').$type<string[]>(),
  willingToPayOnetime: text('willing_to_pay_onetime'),
  willingToPayMonthly: text('willing_to_pay_monthly'),
  wouldPreorder: boolean('would_preorder').notNull().default(false),
  wantsCall: boolean('wants_call').notNull().default(false),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
});
