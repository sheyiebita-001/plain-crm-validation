# SKILL: base-context

Every other skill in this project inherits from this one. Read this first, every session.

## Project

**Plain CRM** — a flat-priced HubSpot alternative for solopreneurs, coaches, and consultants.
Pricing: £197 one-time + £19/month, unlimited contacts, single user at MVP.
Positioning: respects the user's business — no contact tax, no seat tax, no surprise renewals.

## Stack (non-negotiable at MVP)

- **Framework:** Next.js 14+ with App Router
- **Language:** TypeScript, `strict: true`
- **DB:** Supabase Postgres
- **ORM:** Drizzle (not Prisma)
- **Auth:** Supabase Auth (email + Google OAuth)
- **UI:** Tailwind CSS + shadcn/ui components
- **Forms:** React Hook Form + Zod
- **System email:** Resend
- **User-sent email:** Gmail API via user's OAuth (sensitive scopes only)
- **Background jobs:** Inngest (free tier) or Vercel Cron
- **Hosting:** Vercel
- **Payments:** Stripe Checkout + Customer Portal
- **Error tracking:** Sentry

## Multi-tenant rules (CRITICAL)

The biggest risk in this codebase is data leaking across workspaces. These rules are non-negotiable:

1. **Every row in every business table has a `workspace_id` column.** This includes contacts, companies, deals, activities, tasks, templates, forms, meetings, bookings, oauth_connections.
2. **Every Drizzle query filters by `workspace_id`,** even though RLS would catch a missed filter. Defence in depth.
3. **RLS policies must be added to every table** in the same migration that creates the table. Migrations without RLS policies are rejected at code review.
4. **The current workspace_id is derived from the authenticated user's session,** never from URL params or request bodies.
5. **Cross-workspace operations don't exist** at MVP. If you think you need one, stop and ask.

## Code style

- Server actions for mutations. API routes only for webhooks and public endpoints (forms, tracking pixels, OAuth callbacks).
- Validation at every boundary with Zod. The same schema is used client-side (RHF) and server-side (action input).
- Async/await throughout. No callbacks, no `.then()` chains.
- Named exports unless the file genuinely has one default export (Next.js page/layout files).
- Server components by default. Client components only when interactivity demands it (`'use client'` directive).
- `any` is forbidden. Use `unknown` and narrow.
- File names: kebab-case for files, PascalCase for components, camelCase for functions.

## Folder structure

```
src/
  app/
    (auth)/
      login/
      signup/
    (app)/
      dashboard/
      contacts/
      companies/
      deals/
      ...
    (public)/
      book/[slug]/
      f/[slug]/  (form embed)
    api/
      webhooks/
      track/
  components/
    ui/         (shadcn components)
    contacts/
    deals/
    ...
  lib/
    auth/
    db/
    email/
    hubspot/
    google/
  server/
    actions/    (one file per resource)
    queries/    (read helpers)
  db/
    schema/     (Drizzle schemas)
    migrations/
```

## Common patterns

**Getting current workspace in a server action:**
```typescript
import { getCurrentWorkspace } from '@/lib/auth/workspace'

export async function createContact(input: CreateContactInput) {
  const workspace = await getCurrentWorkspace() // throws if not authed
  const validated = createContactSchema.parse(input)
  
  const [contact] = await db.insert(contacts).values({
    ...validated,
    workspaceId: workspace.id,
  }).returning()
  
  return contact
}
```

**Filtering by workspace in queries:**
```typescript
const userContacts = await db
  .select()
  .from(contacts)
  .where(eq(contacts.workspaceId, workspace.id))
```

**RLS policy pattern (in migrations):**
```sql
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their workspace contacts"
ON contacts
FOR ALL
USING (
  workspace_id IN (
    SELECT id FROM workspaces 
    WHERE owner_user_id = auth.uid()
  )
);
```

## What to do when you're unsure

1. **Stop.** Don't guess at architecture.
2. **Ask the user** with a specific question and 2-3 options.
3. **Default conservative** — pick the simpler option, flag tech debt for later.

## What's out of scope at MVP (don't build these even if asked)

- Marketing email blasts
- CMS / website hosting
- Live chat widget
- Custom objects beyond contact/company/deal/activity
- Multi-step workflow automation
- Email sequences (multi-step drip)
- Team seats / multi-user workspaces
- Mobile native apps
- AI features beyond what's in the relevant skill

## Acceptance criteria checklist (every skill must pass)

- [ ] All new tables have `workspace_id` column
- [ ] All new tables have RLS policies in the migration
- [ ] All server actions call `getCurrentWorkspace()`
- [ ] All Zod schemas validate user input before database operations
- [ ] No `any` types
- [ ] No console.log left in code
- [ ] No hardcoded secrets
- [ ] At least one happy-path integration test per server action
- [ ] Manual QA steps documented in PR description
