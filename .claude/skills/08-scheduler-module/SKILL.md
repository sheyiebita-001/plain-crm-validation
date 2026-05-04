# SKILL: 08-scheduler-module

**Inherits:** `base-context/SKILL.md`
**Depends on:** `02-contacts-module`, `05-email-send`
**Build difficulty:** 4/5
**Estimated time:** 3-4 sessions

## Goal

Calendly-style booking links. Users create a meeting type (e.g. "30-min discovery call"), share a public link, and bookers pick a slot from real-time availability that respects the user's Google Calendar busy times. Each booking creates a contact + activity in the CRM and sends a calendar invite.

## Acceptance criteria

- [ ] Meetings table with workspace_id, RLS
- [ ] Bookings table with relation to meetings and contacts
- [ ] Settings page at `/settings/scheduler` lists meeting types, allows create/edit/delete
- [ ] Each meeting has: name, slug, duration (15/30/45/60 min), description, availability rules (days of week + time ranges), buffer before/after, advance notice, max bookings per day
- [ ] Public booking page at `/book/[user-slug]/[meeting-slug]` (e.g. `plaincrm.com/book/sheyi/discovery`)
- [ ] Booking page shows: 14 days of availability, slot picker (timezone-aware), booking form (name, email, optional questions)
- [ ] Available slots respect Google Calendar busy times (read via `calendar.readonly` — sensitive scope, no CASA)
- [ ] On booking: contact created/matched, activity logged, confirmation email sent to booker, calendar invite (.ics) sent to both
- [ ] Booker timezone auto-detected, can be changed
- [ ] Reschedule and cancel links in confirmation email work
- [ ] All meta acceptance criteria

## Files to create

```
src/db/schema/meetings.ts
src/db/schema/bookings.ts
src/db/migrations/0008_scheduler.sql

src/app/(public)/book/[userSlug]/[meetingSlug]/page.tsx
src/app/(public)/book/[userSlug]/[meetingSlug]/booked/page.tsx
src/app/(public)/book/cancel/[token]/page.tsx
src/app/(public)/book/reschedule/[token]/page.tsx

src/app/(app)/settings/scheduler/page.tsx
src/app/(app)/settings/scheduler/[id]/page.tsx

src/server/actions/meetings.ts
src/server/actions/bookings.ts

src/components/scheduler/meeting-form.tsx
src/components/scheduler/availability-editor.tsx
src/components/scheduler/booking-page.tsx
src/components/scheduler/slot-picker.tsx
src/components/scheduler/timezone-select.tsx
src/components/scheduler/booking-form.tsx

src/lib/scheduler/availability-engine.ts
src/lib/scheduler/google-calendar.ts
src/lib/scheduler/ics-builder.ts
src/lib/scheduler/timezone.ts
```

## Database schema

```typescript
export const meetings = pgTable('meetings', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  
  durationMinutes: integer('duration_minutes').notNull().default(30),
  
  // jsonb structure: { mon: [{start: "09:00", end: "17:00"}], tue: [...] }
  availability: jsonb('availability').notNull().default({}),
  
  bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
  bufferAfterMinutes: integer('buffer_after_minutes').notNull().default(0),
  
  advanceNoticeHours: integer('advance_notice_hours').notNull().default(2),
  maxAdvanceDays: integer('max_advance_days').notNull().default(60),
  maxBookingsPerDay: integer('max_bookings_per_day'), // null = unlimited
  
  defaultTimezone: text('default_timezone').notNull().default('Europe/London'),
  
  // Custom questions on booking form
  questions: jsonb('questions').notNull().default([]),
  // [{label: "What's your goal?", required: true, type: "text"}]
  
  active: boolean('active').notNull().default(true),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  slugIdx: uniqueIndex('meetings_workspace_slug_idx').on(table.workspaceId, table.slug),
}))

export const bookings = pgTable('bookings', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  meetingId: uuid('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  
  scheduledFor: timestamp('scheduled_for').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  bookerTimezone: text('booker_timezone').notNull(),
  
  questionAnswers: jsonb('question_answers').notNull().default({}),
  
  // Token used in cancel/reschedule URLs
  manageToken: text('manage_token').notNull().unique(),
  
  status: text('status').notNull().default('confirmed'), // 'confirmed' | 'cancelled' | 'rescheduled'
  cancelledAt: timestamp('cancelled_at'),
  cancellationReason: text('cancellation_reason'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  scheduledForIdx: index('bookings_scheduled_for_idx').on(table.scheduledFor),
}))
```

## Availability engine (the hard part)

```typescript
// src/lib/scheduler/availability-engine.ts

export async function getAvailableSlots(params: {
  meeting: Meeting
  fromDate: Date
  toDate: Date
  bookerTimezone: string
}): Promise<Slot[]> {
  // 1. Generate candidate slots based on availability rules
  // 2. Subtract existing bookings in the date range
  // 3. Subtract Google Calendar busy times (if connected)
  // 4. Apply advance notice (don't show slots within X hours from now)
  // 5. Apply max bookings per day
  // 6. Return slots in booker's timezone
  
  const candidateSlots = generateSlotsFromRules(params.meeting, params.fromDate, params.toDate)
  const existingBookings = await getBookingsInRange(params.meeting.id, params.fromDate, params.toDate)
  const calendarBusy = await getGoogleCalendarBusy(params.meeting.workspaceId, params.fromDate, params.toDate)
  
  const available = candidateSlots.filter(slot => {
    if (overlapsAny(slot, existingBookings)) return false
    if (overlapsAny(slot, calendarBusy)) return false
    if (slot.start < addHours(new Date(), params.meeting.advanceNoticeHours)) return false
    return true
  })
  
  return available.map(s => convertToTimezone(s, params.bookerTimezone))
}
```

## Google Calendar integration

Add `calendar.readonly` scope to the existing Google OAuth flow in skill 05. This is sensitive but not restricted.

Update OAuth scopes:
```
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/calendar.events     // for creating events
https://www.googleapis.com/auth/userinfo.email
```

`calendar.events` lets you create the actual event on the user's calendar (not just read). Both are sensitive, no CASA.

```typescript
// src/lib/scheduler/google-calendar.ts

export async function getGoogleCalendarBusy(
  workspaceId: string,
  from: Date,
  to: Date
): Promise<TimeRange[]> {
  const conn = await getActiveGoogleConnection(workspaceId)
  if (!conn) return [] // not connected, no busy times to subtract
  
  const accessToken = await getValidAccessToken(conn)
  
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: [{ id: 'primary' }],
    }),
  })
  
  const data = await response.json()
  return data.calendars.primary.busy.map((b: any) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }))
}

export async function createCalendarEvent(workspaceId: string, booking: Booking, meeting: Meeting): Promise<{ eventId: string }> {
  const conn = await getActiveGoogleConnection(workspaceId)
  if (!conn) throw new Error('Calendar not connected')
  
  const accessToken = await getValidAccessToken(conn)
  
  const event = {
    summary: meeting.name,
    description: meeting.description,
    start: { dateTime: booking.scheduledFor.toISOString() },
    end: { dateTime: addMinutes(booking.scheduledFor, booking.durationMinutes).toISOString() },
    attendees: [
      { email: conn.providerEmail }, // host
      { email: booking.bookerEmail }, // booker
    ],
    conferenceData: {
      createRequest: {
        requestId: booking.id,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  }
  
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }
  )
  
  const data = await response.json()
  return { eventId: data.id }
}
```

## ICS file generation

For users without Google connected, generate an ICS file and attach to the confirmation email.

```typescript
// src/lib/scheduler/ics-builder.ts
import { createEvent } from 'ics'

export function buildIcs(booking: Booking, meeting: Meeting, host: { email: string; name: string }) {
  const { error, value } = createEvent({
    title: meeting.name,
    description: meeting.description ?? '',
    start: dateToIcsArray(booking.scheduledFor),
    duration: { minutes: booking.durationMinutes },
    organizer: { email: host.email, name: host.name },
    attendees: [{ email: booking.bookerEmail, rsvp: true }],
    method: 'REQUEST',
  })
  if (error) throw error
  return value
}
```

## UI requirements

### Public booking page
- Clean, single-purpose layout
- Top: host name, meeting name, duration, brief description
- Calendar widget showing 14 days, available days highlighted
- Click day → time slot picker for that day in booker's timezone
- Timezone dropdown at top of slot picker (auto-detected from browser)
- Click slot → booking form (name, email, custom questions)
- Submit → confirmation page with booking details, calendar invite link

### Confirmation page
- "You're booked!" + meeting details + add-to-calendar buttons (Google, Apple, Outlook)
- Reschedule and Cancel links
- Same content sent via email with ICS attachment

### Settings
- List meeting types with active toggle, edit, copy link, delete
- Form for create/edit:
  - Basic info
  - Availability editor: drag time ranges per day of week
  - Buffer settings
  - Custom questions (drag to reorder)
  - Slug (read-only after creation)

## Out of scope

- Round-robin (multi-host)
- Group bookings (one-to-many)
- Payment-required bookings
- Custom email templates per meeting
- Webhook notifications on booking
- Workflow rules ("send X email after booking")

## Test plan

1. **Create meeting:** form → meeting saved → public link shareable
2. **View booking page (incognito):** load `/book/sheyi/discovery` → 14 days shown, slots respect availability rules
3. **Calendar busy detection:** Block time on your Google Calendar → reload booking page → that slot is no longer available
4. **Book a slot:** Pick slot → fill form → submit → contact created in CRM, activity logged, confirmation email received with ICS, Google Calendar event created with Meet link
5. **Timezone:** Change timezone in dropdown → slots shift correctly
6. **Reschedule:** Click reschedule link in email → new slot picker → confirms → old booking cancelled, new one created
7. **Cancel:** Click cancel link → confirmation → booking marked cancelled, both parties notified
8. **Advance notice:** Set advance notice to 24h → slots within 24h hidden
9. **Max bookings per day:** Set to 3 → after 3 bookings on a day, all remaining slots that day are hidden
10. **Workspace isolation:** Bookings on workspace A not visible from workspace B

## Common pitfalls

- **Timezone hell:** always store `scheduled_for` in UTC. Convert only at display boundaries. Use date-fns-tz, never moment.js.
- **DST transitions:** test bookings around clocks-changing weekends (last Sunday of March / October in UK). The "9am every weekday" rule must shift correctly.
- **Slot collisions:** if two bookers book the same slot simultaneously, only one succeeds. Use a unique constraint or transaction with `SELECT ... FOR UPDATE`.
- **Email deliverability for booking confirmations:** these go via Resend (your domain), so SPF/DKIM/DMARC must be perfect. Test with mail-tester.com before launch.
- **Calendar event creation can fail after booking is saved.** Handle gracefully — log error, show user "Calendar event couldn't be created, here's an ICS link".
- **Don't expose other workspaces' busy slots.** When checking calendar, only check the workspace owner's calendar, not yours.

## Definition of done

You share a real booking link with someone. They book a slot from a different timezone. Both calendars show the event with a Meet link. The contact appears in your CRM with the booking metadata in the activity timeline.
