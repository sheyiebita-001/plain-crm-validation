# SKILL: 02-contacts-module

**Inherits:** `base-context/SKILL.md`
**Build difficulty:** 3/5
**Estimated time:** 2-3 sessions

## Goal

Build the contact management module: contacts table, CRUD operations, list view with search/sort/filter, and detail page with activity timeline scaffolding (timeline rows will be populated by other skills).

## Acceptance criteria

- [ ] Contact schema with workspace_id, RLS policy in migration
- [ ] List page at `/contacts` with: search bar, filter dropdown, sort header, pagination (50/page)
- [ ] Search filters across `firstName`, `lastName`, `email`, `companyName` using Postgres full-text search
- [ ] Filter dropdown supports: lifecycle stage, owner, source, "added this week"
- [ ] Create contact dialog (modal) opens from list and from sidebar
- [ ] Edit contact dialog
- [ ] Delete contact (soft delete with `deleted_at` timestamp)
- [ ] Bulk select + bulk actions (delete, change stage, export CSV)
- [ ] Detail page at `/contacts/[id]` with: header (name, email, company), tabs (Activity, Deals, Tasks, Notes), edit button
- [ ] Activity tab shows empty state with "No activity yet" — populated by skills 05/07
- [ ] Custom fields editor in settings (add/remove field types: text, number, date, dropdown)
- [ ] All meta acceptance criteria from `base-context/SKILL.md`

## Files to create

```
src/db/schema/contacts.ts
src/db/migrations/0002_contacts.sql

src/app/(app)/contacts/page.tsx                  (list)
src/app/(app)/contacts/[id]/page.tsx             (detail)
src/app/(app)/contacts/[id]/edit/page.tsx        (edit; can be modal too)

src/server/actions/contacts.ts
src/server/queries/contacts.ts

src/components/contacts/contact-list.tsx
src/components/contacts/contact-list-row.tsx
src/components/contacts/contact-search.tsx
src/components/contacts/contact-filters.tsx
src/components/contacts/contact-form.tsx         (used in create/edit dialogs)
src/components/contacts/contact-detail-header.tsx
src/components/contacts/contact-activity-timeline.tsx
src/components/contacts/bulk-actions-bar.tsx

src/lib/contacts/schemas.ts                      (Zod schemas)
src/lib/contacts/search.ts                       (search query builder)
```

## Database schema

```typescript
import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core'

export const contacts = pgTable('contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: text('email'),
  phone: text('phone'),
  jobTitle: text('job_title'),
  
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
  ownerId: uuid('owner_id'), // user id
  
  source: text('source'), // 'manual' | 'import' | 'form' | 'hubspot'
  lifecycleStage: text('lifecycle_stage').default('lead'), // lead, mql, sql, customer, evangelist
  
  customFields: jsonb('custom_fields').notNull().default({}),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  workspaceIdx: index('contacts_workspace_idx').on(table.workspaceId),
  emailIdx: index('contacts_email_idx').on(table.workspaceId, table.email),
  // Full-text search index added via raw SQL in migration
}))
```

## Migration extras

```sql
-- Generated tsvector column for full-text search
ALTER TABLE contacts ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(first_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(last_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(email, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(job_title, '')), 'C')
  ) STORED;

CREATE INDEX contacts_search_idx ON contacts USING GIN(search_vector);

-- RLS policy
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_workspace_access"
ON contacts
FOR ALL
USING (
  workspace_id IN (
    SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
  )
);
```

## Server actions (signatures)

```typescript
// src/server/actions/contacts.ts

export async function createContact(input: CreateContactInput): Promise<Contact>
export async function updateContact(id: string, input: UpdateContactInput): Promise<Contact>
export async function deleteContact(id: string): Promise<{ success: true }>
export async function bulkDeleteContacts(ids: string[]): Promise<{ count: number }>
export async function bulkUpdateContacts(ids: string[], updates: BulkUpdateInput): Promise<{ count: number }>
```

All actions:
1. Call `getCurrentWorkspace()`
2. Validate input with Zod
3. Filter by workspace_id in queries
4. Return typed result
5. Revalidate the relevant path with `revalidatePath('/contacts')`

## Search query builder

```typescript
// src/lib/contacts/search.ts
export function buildContactsQuery(workspaceId: string, params: {
  q?: string
  lifecycleStage?: string
  ownerId?: string
  source?: string
  addedSince?: Date
  sortBy?: 'name' | 'createdAt' | 'updatedAt'
  sortDir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}) {
  // Returns Drizzle query with all filters applied
  // Search uses websearch_to_tsquery for natural search syntax
}
```

## UI requirements

### List page
- Top bar: search input (debounced 300ms), filter button (opens popover), sort header, "Add contact" button
- Bulk select: checkbox in header, individual row checkboxes, action bar appears when selected
- Row: avatar (initials), name, email, company, lifecycle stage badge, last activity (relative time)
- Empty state: illustration + "No contacts yet" + "Add your first contact" CTA
- Pagination: page number + "Showing 1-50 of 234"

### Detail page
- Header: avatar, name (editable inline), email, phone, lifecycle stage dropdown, owner avatar, "..." menu (delete, duplicate, export)
- Two-column layout below header:
  - Left (2/3 width): Tabs — Activity | Deals | Tasks | Notes
  - Right (1/3 width): "About" card with all properties, "Company" card if linked, "Custom fields" card

### Forms
- Use React Hook Form + Zod resolver
- Modal dialog from shadcn Dialog
- Cancel + Save buttons
- Toast on success (use sonner)

## Out of scope

- Importing CSV (handled by HubSpot migrator skill 11)
- Email sync to contact (skill 07)
- Contact merging
- Tags (use lifecycle_stage and custom fields)
- Contact ownership transfers (single-user MVP)

## Test plan

1. **Create:** Open contact form, fill in all fields, save → contact appears at top of list, detail page shows correct data
2. **Edit:** Edit contact → fields update → updated_at changes
3. **Search:** Type partial name → matching contacts appear, others filtered out
4. **Filter:** Apply lifecycle filter → only matching contacts show; clear filter → all return
5. **Sort:** Click name header → sorts ascending; click again → descending
6. **Pagination:** Create 60 contacts → page 2 has 10
7. **Bulk delete:** Select 5 contacts, click delete in bulk bar → confirm → all 5 soft-deleted
8. **Workspace isolation:** Create contact as User A, log in as User B → User B sees no contacts

## Common pitfalls

- **Search performance:** for >10k contacts, the GIN index is essential. Don't try ILIKE — it's slow without trigram extension and worse than full-text search.
- **Soft delete leakage:** all queries must filter `WHERE deleted_at IS NULL` or contacts will reappear after "deletion".
- **Custom field validation:** validate against the workspace's custom field schema, not arbitrary jsonb. Otherwise users can corrupt their own data.
- **Email uniqueness:** don't enforce email uniqueness at the DB level. People legitimately have multiple contacts at the same email (e.g. forwarded shared inboxes).

## Definition of done

You can: add a contact, see it in the list, search for it, filter it, click into detail page, edit it, delete it. With 100 dummy contacts, list page renders in under 200ms.
