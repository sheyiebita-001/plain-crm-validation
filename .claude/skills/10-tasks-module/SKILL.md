# SKILL: 10-tasks-module

**Inherits:** `base-context/SKILL.md`
**Depends on:** `02-contacts-module`, `04-deals-pipeline`
**Build difficulty:** 1/5
**Estimated time:** 1 session

## Goal

Tasks attached to contacts and deals. Today / overdue dashboard view. Optional 9am morning email reminder.

## Acceptance criteria

- [ ] Tasks table with workspace_id and RLS
- [ ] Tasks list at `/tasks` with: today, this week, overdue, completed tabs
- [ ] Create task from sidebar, contact detail, deal detail
- [ ] Edit task, mark complete, delete
- [ ] Tasks page has filter by linked contact / deal
- [ ] Vercel Cron job runs daily at 9am user's local time, sends digest email of due tasks
- [ ] Email digest only sent if user has tasks due (no empty digests)
- [ ] User can disable digest in settings
- [ ] All meta acceptance criteria

## Files to create

```
src/db/schema/tasks.ts
src/db/migrations/0010_tasks.sql

src/app/(app)/tasks/page.tsx
src/app/api/cron/task-reminders/route.ts

src/server/actions/tasks.ts

src/components/tasks/task-list.tsx
src/components/tasks/task-form.tsx
src/components/tasks/task-row.tsx
src/components/tasks/task-quick-add.tsx
src/components/tasks/dashboard-widget.tsx

src/lib/tasks/digest-email.tsx                 (React Email template)
```

## Database schema

```typescript
export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  title: text('title').notNull(),
  description: text('description'),
  
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
  dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'cascade' }),
  
  ownerId: uuid('owner_id').notNull(),
  
  dueDate: date('due_date'),
  dueTime: text('due_time'), // 'HH:MM' format, optional
  
  priority: text('priority').notNull().default('normal'), // 'low' | 'normal' | 'high'
  
  completedAt: timestamp('completed_at'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('tasks_workspace_idx').on(table.workspaceId),
  ownerDueIdx: index('tasks_owner_due_idx').on(table.ownerId, table.dueDate),
}))
```

## Vercel Cron config

In `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/task-reminders",
      "schedule": "0 8 * * *"
    }
  ]
}
```

Runs at 08:00 UTC daily. The handler then iterates users and sends digests at their local 9am.

```typescript
// src/app/api/cron/task-reminders/route.ts

export async function GET(req: Request) {
  // Verify cron secret
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  // Find users whose local time is 9am right now
  const usersToNotify = await db.execute(sql`
    SELECT u.id, u.email, u.timezone, w.id as workspace_id
    FROM users u
    JOIN workspaces w ON w.owner_user_id = u.id
    WHERE u.email_digest_enabled = true
      AND extract(hour from now() AT TIME ZONE u.timezone) = 9
  `)
  
  for (const user of usersToNotify) {
    const tasks = await getDueTasks(user.workspace_id, user.id)
    if (tasks.length === 0) continue // no empty digests
    
    await sendDigestEmail(user.email, tasks)
  }
  
  return Response.json({ sent: usersToNotify.length })
}
```

## Digest email

Use React Email + Resend. Simple template:

```tsx
// src/lib/tasks/digest-email.tsx
export function TaskDigestEmail({ tasks, userName, appUrl }: Props) {
  const overdue = tasks.filter(t => isOverdue(t))
  const today = tasks.filter(t => isToday(t))
  
  return (
    <Html>
      <Body>
        <Heading>Good morning, {userName}</Heading>
        <Text>You have {tasks.length} tasks today.</Text>
        
        {overdue.length > 0 && (
          <Section>
            <Heading as="h2">Overdue ({overdue.length})</Heading>
            {overdue.map(t => <TaskRow key={t.id} task={t} appUrl={appUrl} />)}
          </Section>
        )}
        
        <Section>
          <Heading as="h2">Today ({today.length})</Heading>
          {today.map(t => <TaskRow key={t.id} task={t} appUrl={appUrl} />)}
        </Section>
        
        <Button href={`${appUrl}/tasks`}>Open in Plain CRM</Button>
      </Body>
    </Html>
  )
}
```

## UI requirements

### Tasks page
- Tabs: Today | This Week | Overdue | Completed | All
- Quick-add input at top: "Add a task..." → enter creates with due today
- Row: checkbox (mark complete), title, contact/deal link, due date badge, priority indicator, "..." menu
- Empty state per tab (e.g. "No tasks today. Have a great day.")
- Click row → side panel or modal with edit form

### Quick-add anywhere
- "Add task" button on contact and deal detail pages
- Pre-fills the contact/deal association

### Dashboard widget (used by skill 12)
- "Tasks due today" card showing: count badge, top 3 task titles, "View all" link

## Out of scope

- Recurring tasks (Phase 2)
- Task templates
- Subtasks
- Multi-assignee
- Slack notifications
- In-app push notifications

## Test plan

1. **Create:** Quick-add a task → appears in Today tab
2. **Complete:** Click checkbox → moves to Completed tab → completed_at set
3. **Linked task:** Add task on contact detail page → appears on contact, also in tasks list with link to contact
4. **Overdue:** Set due_date to yesterday → appears in Overdue tab with red indicator
5. **Digest cron:** Manually invoke `/api/cron/task-reminders` with proper auth → digest sent to your test email
6. **No empty digest:** Mark all tasks complete → cron runs → no email sent (verified in logs)
7. **Disabled digest:** Disable in settings → cron runs → no email sent
8. **Workspace isolation:** Tasks across workspaces stay isolated

## Common pitfalls

- **Timezone for due_time:** store as text ('14:00') in user's local timezone, not as timestamp. The user means "2pm in my timezone" not "2pm UTC".
- **Cascade deletes:** if you delete a contact, do you delete their tasks? Yes (cascade) — but warn user when deleting a contact with active tasks.
- **Cron auth:** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Set `CRON_SECRET` env var. Without verification, anyone can trigger your cron.
- **9am detection drift:** if cron runs at 8:00 UTC, users in timezones where local time is currently 9am get notified. Cover all UTC+0 to +12 cleanly with EXTRACT logic; double-check around DST switches.

## Definition of done

You add tasks, see them in the right tabs, complete them, and receive a real digest email at 9am next morning if you have due tasks.
