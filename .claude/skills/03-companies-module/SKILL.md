# SKILL: 03-companies-module

**Inherits:** `base-context/SKILL.md`
**Depends on:** `02-contacts-module`
**Build difficulty:** 2/5
**Estimated time:** 1 session

## Goal

Build the companies module mirroring the contacts module pattern, plus a trigger that auto-links contacts to companies based on email domain.

## Acceptance criteria

- [ ] Companies schema with workspace_id and RLS
- [ ] List page at `/companies` with search, filter, pagination
- [ ] Create/edit/delete company
- [ ] Detail page at `/companies/[id]` showing: header, associated contacts list, deals list, activity timeline
- [ ] Auto-link logic: when a contact is created/updated with an email like `sarah@acme.com`, the system finds-or-creates an Acme company and links them
- [ ] User can manually unlink contact from auto-detected company
- [ ] Common domain blocklist (gmail.com, outlook.com, yahoo.com, icloud.com etc) — these don't trigger auto-link
- [ ] All meta acceptance criteria

## Files to create

```
src/db/schema/companies.ts
src/db/migrations/0003_companies.sql

src/app/(app)/companies/page.tsx
src/app/(app)/companies/[id]/page.tsx

src/server/actions/companies.ts
src/server/queries/companies.ts

src/components/companies/company-list.tsx
src/components/companies/company-form.tsx
src/components/companies/company-detail-header.tsx
src/components/companies/company-contacts-list.tsx
src/components/companies/company-deals-list.tsx

src/lib/companies/schemas.ts
src/lib/companies/auto-link.ts                  (domain detection + company match)
src/lib/companies/personal-email-domains.ts     (blocklist)
```

## Database schema

```typescript
export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  name: text('name').notNull(),
  domain: text('domain'),                       // e.g. "acme.com"
  website: text('website'),
  industry: text('industry'),
  size: text('size'),                           // '1-10' | '11-50' | '51-200' | '201-500' | '500+'
  description: text('description'),
  ownerId: uuid('owner_id'),
  
  customFields: jsonb('custom_fields').notNull().default({}),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  workspaceIdx: index('companies_workspace_idx').on(table.workspaceId),
  domainIdx: index('companies_domain_idx').on(table.workspaceId, table.domain),
}))
```

Add a unique constraint on `(workspace_id, domain)` so only one company per domain per workspace.

## Auto-link logic

```typescript
// src/lib/companies/auto-link.ts

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com',
  'me.com', 'aol.com', 'protonmail.com', 'pm.me', 'live.com', 'msn.com',
  // ...full list in personal-email-domains.ts
])

export async function autoLinkContactToCompany(
  workspaceId: string,
  email: string,
): Promise<{ companyId: string; created: boolean } | null> {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain || PERSONAL_DOMAINS.has(domain)) return null
  
  // Find existing
  const existing = await db.query.companies.findFirst({
    where: and(
      eq(companies.workspaceId, workspaceId),
      eq(companies.domain, domain),
    ),
  })
  if (existing) return { companyId: existing.id, created: false }
  
  // Create new with name = capitalized domain root
  const name = domainToCompanyName(domain) // e.g. "acme.com" -> "Acme"
  const [created] = await db.insert(companies).values({
    workspaceId,
    name,
    domain,
    website: `https://${domain}`,
  }).returning()
  
  return { companyId: created.id, created: true }
}
```

Call this from the contact create/update server actions:
```typescript
// In createContact / updateContact
if (input.email && !input.companyId) {
  const link = await autoLinkContactToCompany(workspace.id, input.email)
  if (link) input.companyId = link.companyId
}
```

## UI requirements

### List page
- Same shape as contacts list: search, filters, sort, pagination
- Row: company logo placeholder (initial letter or favicon from domain), name, domain, # of contacts, # of deals, last activity

### Detail page
- Header: name (editable), domain, website link, industry, size, owner
- Tabs: Contacts | Deals | Activity | Notes
- Right sidebar: company info card, custom fields card

## Out of scope

- Company enrichment from external APIs (Clearbit, Apollo) — this is a Phase 2 paid add-on
- Hierarchical companies (parent / subsidiary)
- Company merging
- Logo upload (use favicon at `https://{domain}/favicon.ico`)

## Test plan

1. **Create company manually:** form → list updated → detail page works
2. **Auto-link on contact create:** Create contact with email `john@newcorp.com` → "Newcorp" company auto-created and linked
3. **Existing company match:** Create another contact with `jane@newcorp.com` → linked to same Newcorp company (not a duplicate)
4. **Personal domain blocked:** Create contact with `bob@gmail.com` → no company created or linked
5. **Domain edit:** Edit a company's domain → existing contacts on that domain remain linked
6. **Workspace isolation:** Companies in workspace A invisible from workspace B

## Common pitfalls

- **Don't auto-link on every email property update.** Only when email or companyId changes. Otherwise edits become slow.
- **Domain casing:** lowercase before comparison. `Acme.COM` and `acme.com` should match.
- **Race condition on create:** two contacts with `@newcorp.com` created concurrently can both try to create the company. Wrap the find-or-create in a transaction or use `INSERT ... ON CONFLICT DO NOTHING`.
- **Personal domain list staleness:** keep the list in code (not DB) so it's reviewed in PRs. Update quarterly.

## Definition of done

You can manage companies and auto-linking works reliably. With 50 contacts at varied corporate emails, you should see roughly one company per unique non-personal domain.
