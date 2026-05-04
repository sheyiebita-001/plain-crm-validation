# SKILL: 06-templates-module

**Inherits:** `base-context/SKILL.md`
**Depends on:** `05-email-send`
**Build difficulty:** 2/5
**Estimated time:** 1 session

## Goal

Email templates and short text snippets users can save and reuse. Templates support variables like `{{first_name}}`, `{{company}}`, `{{deal_amount}}`. Insert into compose with one click.

## Acceptance criteria

- [ ] Templates table with workspace_id and RLS
- [ ] List page at `/settings/templates` with search and create
- [ ] Create/edit/delete template
- [ ] Template includes: name, subject, body (rich text)
- [ ] Variable picker in editor: `{{first_name}}`, `{{last_name}}`, `{{full_name}}`, `{{email}}`, `{{company}}`, `{{deal_name}}`, `{{deal_amount}}`, `{{my_first_name}}`, `{{my_email}}`
- [ ] In compose modal, "Insert template" dropdown lists templates; selecting one populates subject + body with variables substituted from current contact/deal context
- [ ] Snippets (single-line text) stored separately for quick insertion
- [ ] Template duplicate button
- [ ] All meta acceptance criteria

## Files to create

```
src/db/schema/email-templates.ts
src/db/migrations/0006_templates.sql

src/app/(app)/settings/templates/page.tsx
src/app/(app)/settings/templates/new/page.tsx
src/app/(app)/settings/templates/[id]/page.tsx

src/server/actions/email-templates.ts

src/components/templates/template-list.tsx
src/components/templates/template-form.tsx
src/components/templates/variable-picker.tsx
src/components/templates/template-insert-dropdown.tsx

src/lib/templates/variables.ts                 (substitution engine)
src/lib/templates/schemas.ts
```

## Database schema

```typescript
export const emailTemplates = pgTable('email_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  name: text('name').notNull(),
  kind: text('kind').notNull().default('email'), // 'email' | 'snippet'
  
  subject: text('subject'),
  bodyHtml: text('body_html'),
  
  // Cached list of variable names extracted from subject + body
  variables: text('variables').array().notNull().default([]),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('templates_workspace_idx').on(table.workspaceId),
}))
```

## Variable substitution

```typescript
// src/lib/templates/variables.ts

export const AVAILABLE_VARIABLES = [
  { key: 'first_name', label: "Contact's first name", source: 'contact' },
  { key: 'last_name', label: "Contact's last name", source: 'contact' },
  { key: 'full_name', label: "Contact's full name", source: 'contact' },
  { key: 'email', label: "Contact's email", source: 'contact' },
  { key: 'company', label: "Contact's company name", source: 'contact' },
  { key: 'job_title', label: "Contact's job title", source: 'contact' },
  { key: 'deal_name', label: 'Deal name', source: 'deal' },
  { key: 'deal_amount', label: 'Deal amount (formatted)', source: 'deal' },
  { key: 'my_first_name', label: 'Your first name', source: 'user' },
  { key: 'my_email', label: 'Your email', source: 'user' },
] as const

export function substituteVariables(template: string, context: {
  contact?: Contact
  deal?: Deal
  user?: User
}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    switch (key) {
      case 'first_name': return context.contact?.firstName ?? ''
      case 'last_name': return context.contact?.lastName ?? ''
      case 'full_name': 
        return [context.contact?.firstName, context.contact?.lastName].filter(Boolean).join(' ')
      case 'email': return context.contact?.email ?? ''
      case 'company': return context.company?.name ?? ''
      case 'job_title': return context.contact?.jobTitle ?? ''
      case 'deal_name': return context.deal?.name ?? ''
      case 'deal_amount': return formatCurrency(context.deal?.amount, context.deal?.currency)
      case 'my_first_name': return context.user?.firstName ?? ''
      case 'my_email': return context.user?.email ?? ''
      default: return `{{${key}}}` // leave unrecognized vars in place
    }
  })
}

export function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g) ?? []
  return [...new Set(matches.map(m => m.slice(2, -2)))]
}
```

## UI requirements

### Templates list
- Search by name
- "New template" button
- Row: name, subject preview, variable chips (showing which vars used), kind badge, last edited date
- Click row → edit page

### Template form
- Name input
- Kind selector (Email | Snippet)
- Subject input (only for Email kind)
- Body editor (TipTap, same as compose)
- Variable picker as a dropdown above editor — clicking inserts `{{var_name}}` at cursor
- Live preview pane (right side on desktop, below on mobile) showing rendered with sample data

### Insert template dropdown (in compose modal)
- Trigger: "Insert template" button in compose toolbar
- Popover with search, list of templates
- Click → confirm dialog if compose body has content (overwrite warning)
- Variables substituted server-side using current contact/deal context

## Out of scope

- Multi-step sequences (Phase 2 — different feature)
- Template sharing between users
- Template categories/folders
- Conditional logic (`{{#if contact.company}}...{{/if}}`)
- Nested templates / partials
- A/B test variants

## Test plan

1. **Create:** New template with variables → save → appears in list with correct variable chips
2. **Insert:** Open compose for contact "Sarah Chen" of "Acme" → Insert template "Cold Outreach" → subject and body populate with "Hi Sarah, ... Acme ..."
3. **Missing variable:** Insert template using `{{deal_name}}` while no deal is selected → renders as empty string, not literal `{{deal_name}}`
4. **Snippet kind:** Create snippet → does not appear in subject field
5. **Workspace isolation:** Templates not visible across workspaces

## Common pitfalls

- **HTML escaping:** when substituting variables into body HTML, escape user-provided values to prevent breaking HTML or XSS in the editor preview. Use a small DOMPurify wrapper or escape before insertion.
- **Variable extraction lag:** cached `variables` column should be regenerated on every save, not derived from text at read time. Otherwise queries that filter by "templates using variable X" are slow.
- **Currency formatting:** `formatCurrency(undefined)` should return empty string, not "NaN" or "£undefined".

## Definition of done

User can create a template, insert it into compose for any contact, and the substituted email goes out cleanly. Variables persist across edits.
