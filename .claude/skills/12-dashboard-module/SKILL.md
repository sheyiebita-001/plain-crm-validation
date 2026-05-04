# SKILL: 12-dashboard-module

**Inherits:** `base-context/SKILL.md`
**Depends on:** all preceding skills (02-11)
**Build difficulty:** 2/5
**Estimated time:** 1-2 sessions

## Goal

The home screen the user sees when they log in. Six fixed widgets giving an at-a-glance view of pipeline health and recent activity. No customization at MVP — just useful defaults.

## Acceptance criteria

- [ ] Dashboard at `/dashboard` (default home)
- [ ] Six widgets in a responsive grid:
  1. Pipeline summary: deals by stage with counts and total value
  2. Tasks due today (count + top 3 list)
  3. Recent activity feed (last 10 actions across the workspace)
  4. Contacts added this week (number + sparkline of last 30 days)
  5. Email stats: sent this week, open rate, click rate
  6. Upcoming bookings: next 5 scheduled meetings
- [ ] All queries are server-side and cached for 60 seconds
- [ ] Widgets render skeleton loaders while data loads
- [ ] Each widget has a "View all →" link to its full page
- [ ] Onboarding checklist (from skill 01) replaces dashboard until 3+ checklist items completed
- [ ] All meta acceptance criteria

## Files to create

```
src/app/(app)/dashboard/page.tsx                 (existing from skill 01, replace)

src/components/dashboard/dashboard-grid.tsx
src/components/dashboard/widget-card.tsx
src/components/dashboard/widgets/pipeline-summary.tsx
src/components/dashboard/widgets/tasks-today.tsx
src/components/dashboard/widgets/recent-activity.tsx
src/components/dashboard/widgets/contacts-added.tsx
src/components/dashboard/widgets/email-stats.tsx
src/components/dashboard/widgets/upcoming-bookings.tsx

src/server/queries/dashboard.ts                  (all dashboard queries in one file)
```

## Server queries

```typescript
// src/server/queries/dashboard.ts

export async function getPipelineSummary(workspaceId: string) {
  // Query: stage_id, name, count(deals), sum(amount) for default pipeline
  return db.execute(sql`
    SELECT s.id, s.name, s.position, COUNT(d.id) as count, COALESCE(SUM(d.amount), 0) as total
    FROM stages s
    LEFT JOIN deals d ON d.stage_id = s.id AND d.deleted_at IS NULL
    JOIN pipelines p ON p.id = s.pipeline_id
    WHERE p.workspace_id = ${workspaceId} AND p.is_default = true
    GROUP BY s.id
    ORDER BY s.position
  `)
}

export async function getTasksDueToday(workspaceId: string, userId: string) {
  return db.query.tasks.findMany({
    where: and(
      eq(tasks.workspaceId, workspaceId),
      eq(tasks.ownerId, userId),
      isNull(tasks.completedAt),
      lte(tasks.dueDate, new Date()),
    ),
    orderBy: [tasks.priority, tasks.dueDate],
    limit: 3,
  })
}

export async function getRecentActivity(workspaceId: string) {
  return db.query.activities.findMany({
    where: eq(activities.workspaceId, workspaceId),
    orderBy: [desc(activities.createdAt)],
    limit: 10,
    with: { contact: true, deal: true },
  })
}

export async function getContactsAddedThisWeek(workspaceId: string) {
  // Returns: count this week + 30-day daily counts for sparkline
  const thirtyDaysAgo = subDays(new Date(), 30)
  
  const dailyCounts = await db.execute(sql`
    SELECT date_trunc('day', created_at) as day, COUNT(*) as count
    FROM contacts
    WHERE workspace_id = ${workspaceId}
      AND created_at >= ${thirtyDaysAgo}
      AND deleted_at IS NULL
    GROUP BY day
    ORDER BY day
  `)
  
  return {
    weekTotal: dailyCounts.filter(d => d.day >= subDays(new Date(), 7)).reduce((sum, d) => sum + d.count, 0),
    sparkline: dailyCounts,
  }
}

export async function getEmailStats(workspaceId: string) {
  const oneWeekAgo = subDays(new Date(), 7)
  
  const result = await db.execute(sql`
    SELECT 
      COUNT(*) FILTER (WHERE direction = 'out' AND sent_at >= ${oneWeekAgo}) as sent,
      COUNT(*) FILTER (WHERE direction = 'out' AND sent_at >= ${oneWeekAgo} AND opened_at IS NOT NULL) as opened,
      COUNT(*) FILTER (WHERE direction = 'out' AND sent_at >= ${oneWeekAgo} AND first_clicked_at IS NOT NULL) as clicked
    FROM email_messages
    WHERE workspace_id = ${workspaceId}
  `)
  
  const { sent, opened, clicked } = result[0]
  return {
    sent,
    openRate: sent > 0 ? opened / sent : 0,
    clickRate: sent > 0 ? clicked / sent : 0,
  }
}

export async function getUpcomingBookings(workspaceId: string) {
  return db.query.bookings.findMany({
    where: and(
      eq(bookings.workspaceId, workspaceId),
      gte(bookings.scheduledFor, new Date()),
      eq(bookings.status, 'confirmed'),
    ),
    orderBy: [bookings.scheduledFor],
    limit: 5,
    with: { meeting: true, contact: true },
  })
}
```

## Cache strategy

Use Next.js `unstable_cache` with workspace-scoped keys, 60-second TTL:

```typescript
const getCachedPipelineSummary = unstable_cache(
  (workspaceId) => getPipelineSummary(workspaceId),
  ['dashboard-pipeline'],
  { revalidate: 60, tags: [`workspace-${workspaceId}-deals`] }
)
```

Invalidate the relevant tags from server actions that mutate (`revalidateTag('workspace-X-deals')` from createDeal, moveDealToStage etc.).

## UI requirements

### Layout
- Grid: 3 columns desktop (1024px+), 2 columns tablet, 1 column mobile
- Widgets are roughly square; some span 2 cells (pipeline summary, recent activity)
- Each widget is a Card from shadcn/ui with header (title, View all link) and content

### Widget designs

**Pipeline summary (spans 2 cells)**
- Horizontal bar showing stages with deal counts
- Click stage → /deals filtered by stage
- Total pipeline value displayed prominently

**Tasks today**
- Big number "5" tasks due
- List of top 3 (title + due time)
- "View all tasks →"

**Recent activity (spans 2 cells)**
- Vertical list with icons by type (email, note, deal change, etc.)
- Each row: icon, action description, contact link, relative time
- "View all activity →"

**Contacts added this week**
- Big number "23"
- Sparkline of last 30 days underneath
- "+12 from last week" delta indicator

**Email stats**
- Sent count
- Open rate as percentage with progress bar
- Click rate as percentage with progress bar
- Color: green if open rate > 30%, amber 15-30%, red < 15%

**Upcoming bookings**
- List of 5 next bookings
- Each row: date/time, attendee name, meeting type
- "View all bookings →"

### Onboarding override

If `workspace.onboarding_steps` has fewer than 3 completed items, show the onboarding checklist (from skill 01) instead of the dashboard. Once 3+ items are done, the dashboard becomes default.

Add a "Show onboarding" link in the dashboard header that brings the checklist back.

## Out of scope

- Custom dashboards / drag-to-rearrange widgets
- More widget types (stage conversion rates, source attribution, owner leaderboard)
- Date range selectors (everything is fixed: today, this week, etc.)
- Export dashboard as PDF
- Sharing dashboards externally

## Test plan

1. **Empty state:** New workspace → onboarding checklist shown (not dashboard)
2. **Populated dashboard:** Workspace with 50 contacts, 10 deals, 5 tasks → all 6 widgets render with real data
3. **Cache:** Reload page → widgets render from cache (verify in network tab — second load is faster)
4. **Cache invalidation:** Create a deal → revalidateTag fires → next dashboard load shows updated pipeline
5. **Performance:** Dashboard renders in under 500ms with 1k contacts, 100 deals, 20 active tasks
6. **Workspace isolation:** Numbers reflect only the current workspace

## Common pitfalls

- **N+1 queries:** the recent activity widget needs contact and deal joins. Don't fetch them per row — use Drizzle's `with: {}` relations to batch.
- **Date math at workspace timezone:** "this week" depends on the user's locale. Compute boundaries in user's timezone (use `date-fns-tz`).
- **Empty state per widget:** every widget needs an empty state ("No emails sent yet — try sending one"). Don't show 0% open rate as red.
- **Skeleton loaders:** show shadcn `Skeleton` components matching widget shape during load. Don't show empty cards or "Loading..." text — feels broken.

## Definition of done

You log in and the dashboard tells you, in 5 seconds of glancing, what's happening in your business this week. Every number is correct. Every link goes to the right detailed view.
