# SKILL: 01-auth-setup

**Inherits:** `base-context/SKILL.md`
**Build difficulty:** 2/5
**Estimated time (Claude Code agentic):** 1-2 sessions

## Goal

Build the authentication foundation: signup with email/Google OAuth, automatic workspace creation on first login, RLS scaffolding, and an onboarding checklist UI on the empty dashboard.

By end of skill: a new user can sign up, land in their own workspace, see an empty dashboard with a 4-step onboarding checklist, and log out/back in successfully.

## Acceptance criteria

- [ ] User can sign up with email + password
- [ ] User can sign up with Google OAuth
- [ ] On first login, a `workspace` row is created automatically with the user as `owner_user_id`
- [ ] Workspace gets a unique 8-character slug for the BCC dropbox address
- [ ] Empty dashboard renders with onboarding checklist (4 steps, see UI section below)
- [ ] Logged-out users hitting `/dashboard` redirect to `/login`
- [ ] Logged-in users hitting `/login` redirect to `/dashboard`
- [ ] Logout button in header works
- [ ] Email verification required before dashboard access (Supabase default)
- [ ] All meta acceptance criteria from `base-context/SKILL.md`

## Files to create

```
src/db/schema/workspaces.ts
src/db/schema/auth.ts          (extends Supabase Auth users)
src/db/migrations/0001_workspaces.sql

src/app/(auth)/login/page.tsx
src/app/(auth)/signup/page.tsx
src/app/(auth)/callback/route.ts   (OAuth callback)
src/app/(auth)/layout.tsx

src/app/(app)/dashboard/page.tsx
src/app/(app)/layout.tsx       (protects all (app) routes)

src/components/auth/login-form.tsx
src/components/auth/signup-form.tsx
src/components/dashboard/onboarding-checklist.tsx
src/components/layout/app-header.tsx

src/lib/auth/workspace.ts      (getCurrentWorkspace, createWorkspaceForUser)
src/lib/auth/server.ts         (server-side auth helpers)
src/lib/auth/client.ts         (client-side Supabase client)
src/middleware.ts              (auth redirect middleware)
```

## Database schema

```typescript
// src/db/schema/workspaces.ts
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerUserId: uuid('owner_user_id').notNull(), // Supabase auth.users.id
  dropboxSlug: text('dropbox_slug').notNull().unique(), // for BCC dropbox
  plan: text('plan').notNull().default('free'),
  onboardingSteps: jsonb('onboarding_steps').notNull().default({
    importContacts: false,
    connectGmail: false,
    createFirstDeal: false,
    sendFirstEmail: false,
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

## Migration SQL (excerpt)

```sql
-- workspaces table
CREATE TABLE workspaces (...);

-- Enable RLS
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own workspaces
CREATE POLICY "workspaces_owner_access"
ON workspaces
FOR ALL
USING (owner_user_id = auth.uid());

-- Trigger to update updated_at
CREATE TRIGGER workspaces_updated_at
BEFORE UPDATE ON workspaces
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
```

## Workspace creation logic

In `src/lib/auth/workspace.ts`:

```typescript
export async function ensureWorkspace(userId: string, displayName: string) {
  // Check if user already has a workspace
  const existing = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerUserId, userId),
  })
  if (existing) return existing
  
  // Generate unique 8-char slug for dropbox
  const dropboxSlug = await generateUniqueDropboxSlug()
  
  const [workspace] = await db.insert(workspaces).values({
    name: `${displayName}'s Workspace`,
    slug: slugify(`${displayName}-${nanoid(6)}`),
    ownerUserId: userId,
    dropboxSlug,
  }).returning()
  
  return workspace
}
```

Call `ensureWorkspace` from the OAuth callback and after email verification.

## UI requirements

### Login/signup pages
- Use shadcn/ui `Card`, `Input`, `Button` components
- "Continue with Google" button at top, divider, then email/password
- Error messages shown via shadcn `Alert`
- Loading state on submit (button shows spinner)
- Logo + tagline at top, link to other auth page at bottom

### Dashboard onboarding checklist
4 items as cards in a 2x2 grid:

1. **Import your contacts from HubSpot** — links to `/settings/integrations/hubspot`
2. **Connect your Gmail** — links to `/settings/integrations/google`
3. **Create your first deal** — links to `/deals/new`
4. **Send your first tracked email** — disabled until Gmail connected

Each card has: icon, title, one-sentence description, action button. Completed items show checkmark and grey out.

### App header
- Logo (left)
- Search (center, can be a placeholder at this point)
- User avatar dropdown (right) with: Settings, Logout

## Out of scope

- Team members / multiple users per workspace
- Workspace switching (each user has exactly one workspace at MVP)
- Password reset (Supabase handles UI)
- 2FA
- SSO

## Test plan

1. **Sign up flow (email):** Sign up → check email received → click link → land on dashboard → workspace exists in DB
2. **Sign up flow (Google):** Click "Continue with Google" → consent → land on dashboard → workspace exists
3. **Multi-account isolation:** Create User A with Workspace A. Create User B. User B's dashboard shows their own workspace, not A's. Verify in SQL: `SELECT * FROM workspaces WHERE owner_user_id = 'user-b-id'` returns one row.
4. **Logged-out redirect:** Open `/dashboard` in incognito → redirects to `/login`
5. **Logged-in redirect:** While logged in, hit `/login` → redirects to `/dashboard`
6. **Logout:** Click logout → cleared session → redirected to `/login`

## Common pitfalls

- **Don't create the workspace in the signup form action.** Create it in the post-verification callback to handle Google OAuth (which skips email verification) and email signup (which doesn't) consistently.
- **Slug uniqueness:** the dropbox slug must be globally unique across all workspaces (not just per user) because it's used in inbound email routing.
- **Middleware vs layout protection:** use middleware for the redirect, not layout guards. Layout guards run after the page tries to render and leak data.
- **Don't forget to enable Google OAuth provider** in Supabase dashboard before testing.

## Definition of done

You should be able to demo: clean Vercel preview, sign up with Google, see your name in the header, see the 4-step onboarding checklist, log out, log back in, see same workspace.
