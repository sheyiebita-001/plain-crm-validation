# SKILL: 11-hubspot-migrator

**Inherits:** `base-context/SKILL.md`
**Depends on:** `02-contacts-module`, `03-companies-module`, `04-deals-pipeline`
**Build difficulty:** 4/5
**Estimated time:** 3-4 sessions

## Goal

The killer differentiator. One click, connect HubSpot, walk away, get an email when all your contacts, companies, deals, and activities are imported. This is the feature people will pay £197 for even if every other feature is mediocre.

## Acceptance criteria

- [ ] HubSpot OAuth connection stored in oauth_connections table
- [ ] Settings page at `/settings/integrations/hubspot` with Connect button
- [ ] Import button kicks off background job
- [ ] Job uses HubSpot's CRM Exports API (POST `/crm/v3/exports/export/async`) to export contacts, companies, deals, engagements
- [ ] Job polls export status; on completion, downloads CSV/JSON files
- [ ] Job parses files, maps fields, inserts into our DB respecting workspace isolation
- [ ] Associations preserved (deal → contact, deal → company, contact → company)
- [ ] Custom HubSpot properties imported into our `custom_fields` jsonb
- [ ] Activities (notes, calls, meetings, emails) imported into our activities table
- [ ] Real-time progress UI: "Importing contacts (1,234 / 5,000)..." 
- [ ] Email notification when complete with summary stats
- [ ] Idempotent: re-running migration doesn't duplicate (uses HubSpot Record ID as external key)
- [ ] Failed migrations show error log with retry option
- [ ] All meta acceptance criteria

## Files to create

```
src/db/schema/migrations.ts                    (track import jobs)
src/db/migrations/0011_hubspot_imports.sql

src/app/(app)/settings/integrations/hubspot/page.tsx
src/app/api/oauth/hubspot/callback/route.ts
src/app/api/migrations/[id]/status/route.ts

src/server/actions/hubspot-migrate.ts
src/server/jobs/hubspot-import.ts              (Inngest function)

src/components/integrations/hubspot-card.tsx
src/components/integrations/migration-progress.tsx
src/components/integrations/migration-history.tsx

src/lib/hubspot/oauth.ts
src/lib/hubspot/client.ts                      (API wrapper)
src/lib/hubspot/exporter.ts                    (export job orchestration)
src/lib/hubspot/importer.ts                    (file parser + DB writer)
src/lib/hubspot/property-mapper.ts             (HubSpot fields → our fields)
```

## Database schema additions

Add HubSpot ID columns to existing tables (idempotency keys):

```sql
ALTER TABLE contacts ADD COLUMN hubspot_id text;
ALTER TABLE companies ADD COLUMN hubspot_id text;
ALTER TABLE deals ADD COLUMN hubspot_id text;
ALTER TABLE activities ADD COLUMN hubspot_id text;

CREATE UNIQUE INDEX contacts_workspace_hubspot_idx ON contacts(workspace_id, hubspot_id) WHERE hubspot_id IS NOT NULL;
-- Same for companies, deals, activities
```

New table for tracking imports:

```typescript
export const importJobs = pgTable('import_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  source: text('source').notNull(), // 'hubspot' | 'csv' | etc.
  status: text('status').notNull(), // 'pending' | 'running' | 'completed' | 'failed'
  
  progress: jsonb('progress').notNull().default({
    contacts: { exported: 0, imported: 0, total: 0 },
    companies: { exported: 0, imported: 0, total: 0 },
    deals: { exported: 0, imported: 0, total: 0 },
    activities: { exported: 0, imported: 0, total: 0 },
  }),
  
  errorMessage: text('error_message'),
  errorDetails: jsonb('error_details'),
  
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

## HubSpot OAuth scopes (minimum)

```
crm.objects.contacts.read
crm.objects.companies.read
crm.objects.deals.read
crm.export
crm.schemas.contacts.read
crm.schemas.companies.read
crm.schemas.deals.read
```

`crm.export` is the magic one — gives access to the async export API which has no rate limits and handles big datasets cleanly.

## Migration flow

```
1. User clicks "Connect HubSpot" → OAuth → tokens stored
2. User clicks "Start migration"
3. Create import_jobs row (status=pending)
4. Trigger Inngest function with workspaceId, jobId
5. Inngest function:
   a. For each object type [contacts, companies, deals, engagements]:
      - POST /crm/v3/exports/export/async
      - Poll GET /crm/v3/exports/export/async/tasks/{taskId} until status=DONE
      - Download CSV from returned URL
      - Stream-parse CSV row-by-row
      - For each row: upsert into our DB by hubspot_id
      - Update import_jobs.progress every 100 rows
   b. After all objects done, link associations from CSV columns
   c. Update status=completed, send email
6. UI polls /api/migrations/[id]/status every 5s for live progress
```

## HubSpot Exports API request

```typescript
// src/lib/hubspot/exporter.ts

export async function startExport(
  accessToken: string,
  objectType: 'contacts' | 'companies' | 'deals',
  properties: string[]
): Promise<string> { // returns task id
  const response = await fetch('https://api.hubapi.com/crm/v3/exports/export/async', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      exportType: 'VIEW',
      exportName: `plaincrm_export_${objectType}_${Date.now()}`,
      objectType: hubspotObjectIds[objectType], // '0-1' for contacts, etc.
      objectProperties: properties,
      format: 'CSV',
      language: 'EN',
    }),
  })
  
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`HubSpot export failed: ${response.status} ${err}`)
  }
  
  const data = await response.json()
  return data.id
}

export async function pollExport(accessToken: string, taskId: string): Promise<{
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'
  downloadUrl?: string
  recordCount?: number
}> {
  const response = await fetch(`https://api.hubapi.com/crm/v3/exports/export/async/tasks/${taskId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  return response.json()
}
```

## Property mapping

```typescript
// src/lib/hubspot/property-mapper.ts

const CONTACT_PROPERTY_MAP: Record<string, string> = {
  'firstname': 'firstName',
  'lastname': 'lastName',
  'email': 'email',
  'phone': 'phone',
  'jobtitle': 'jobTitle',
  'lifecyclestage': 'lifecycleStage',
  // ... map common HubSpot props to ours
}

export function mapHubspotContact(row: Record<string, string>): Partial<Contact> {
  const mapped: any = {}
  const customFields: Record<string, unknown> = {}
  
  for (const [hsKey, value] of Object.entries(row)) {
    if (hsKey === 'Record ID') {
      mapped.hubspotId = value
    } else if (hsKey === 'Associated Company IDs') {
      mapped._associatedCompanyId = value.split(';')[0] // first one
    } else if (CONTACT_PROPERTY_MAP[hsKey]) {
      mapped[CONTACT_PROPERTY_MAP[hsKey]] = value || null
    } else {
      // Anything else goes to custom fields
      if (value) customFields[hsKey] = value
    }
  }
  
  mapped.customFields = customFields
  return mapped
}
```

## Importer (streaming)

For large datasets, parse the CSV stream rather than loading all into memory.

```typescript
// src/lib/hubspot/importer.ts

import { parse } from 'csv-parse'

export async function importContacts(
  workspaceId: string,
  jobId: string,
  csvUrl: string,
) {
  const response = await fetch(csvUrl)
  const stream = response.body!.pipeThrough(parse({ columns: true, skip_empty_lines: true }))
  
  const batch: any[] = []
  let count = 0
  
  for await (const row of stream) {
    batch.push(mapHubspotContact(row))
    count++
    
    if (batch.length >= 500) {
      await db.insert(contacts).values(batch.map(c => ({ ...c, workspaceId })))
        .onConflictDoUpdate({
          target: [contacts.workspaceId, contacts.hubspotId],
          set: { updatedAt: new Date() /* or merge fields */ },
        })
      batch.length = 0
      
      await updateJobProgress(jobId, 'contacts', { imported: count })
    }
  }
  
  // Flush remaining
  if (batch.length > 0) {
    await db.insert(contacts).values(batch.map(c => ({ ...c, workspaceId })))
      .onConflictDoNothing()
  }
}
```

## Activity import (engagements)

HubSpot's "engagements" = our "activities". They have separate types: notes, calls, meetings, emails, tasks.

Use the engagements API (`/crm/v3/objects/notes`, `/calls`, etc.) since the export API doesn't include all engagement types reliably. For each engagement, extract associations to contacts/deals and write our activity row.

## UI requirements

### HubSpot connection card
- Status: Not connected / Connected as user@example.com / Token expired
- Connect / Disconnect button
- "Last imported: 3 days ago" if applicable
- "Start import" button (only when connected)

### Migration progress UI
- Modal that opens when import starts
- Big progress bar: "Importing contacts (1,234 / 5,000)..."
- Sub-progress per object type
- Live ticker with row counts
- "This usually takes 5-30 minutes. We'll email you when done. You can close this and come back."
- After completion: summary "Imported 5,234 contacts, 1,221 companies, 3,456 deals, 12,034 activities"

### Migration history
- List of past migrations with date, status, counts, link to detail
- Failed ones have retry button + error message

## Email notification

After job completes:

```
Subject: Your HubSpot import is ready

Hi Sheyi,

Your HubSpot data is now in Plain CRM:
- 5,234 contacts
- 1,221 companies  
- 3,456 deals
- 12,034 activities

[Open in Plain CRM]

If anything looks wrong, reply to this email and we'll investigate.

— The Plain CRM team
```

## Out of scope

- Two-way sync (live updates from HubSpot to us — Phase 2)
- Importing HubSpot properties as new custom fields with validation rules
- Importing HubSpot workflows
- Importing HubSpot lists / segmentation
- Importing landing pages, forms, ads
- Importing Service Hub tickets

## Test plan

1. **OAuth connect:** Connect HubSpot dev portal → tokens saved → status shows connected
2. **Small import:** HubSpot dev account with 10 contacts, 5 companies, 3 deals → run import → all imported correctly with associations
3. **Re-run idempotency:** Run same import twice → second run updates existing, doesn't duplicate
4. **Custom property:** Add custom HubSpot property → import → it appears in `custom_fields` jsonb
5. **Association:** Deal in HubSpot linked to Company X → after import, deal in our DB linked to corresponding company
6. **Activity import:** HubSpot contact with 3 notes and 2 calls → after import, contact's timeline has 5 activities
7. **Token refresh:** Long-running import causes token to expire mid-job → refresh logic kicks in, job continues
8. **Workspace isolation:** Import on workspace A doesn't write to workspace B
9. **Failure recovery:** Simulate HubSpot 5xx → retries, eventually surfaces error in UI with retry button

## Common pitfalls

- **Pagination of associations:** HubSpot's CRM exports include associated record IDs as semicolon-delimited columns, but only the first 100. For more, use the associations API. Document this limit in your UI.
- **Custom property cardinality:** HubSpot has hundreds of optional properties. Don't request them all — only those that have values for the workspace. Use the Properties API to discover which ones are populated.
- **Date format:** HubSpot exports dates as ISO 8601, but custom date properties sometimes use Unix timestamps. Detect and convert.
- **Lifecycle stage values:** HubSpot uses internal IDs ('subscriber', 'lead', 'marketingqualifiedlead'), not labels. Map these to your scheme.
- **Owner ID:** HubSpot owners are different from your users. Either ignore owner field at import (everything goes to the importing user) or build a mapping UI.
- **HubSpot API rate limits:** the export API itself doesn't rate limit, but property and association queries do (100/10sec for OAuth apps). Implement exponential backoff on 429 responses.
- **Long-running cron:** Vercel functions max out at 10s (free) or 60s (Pro) or 5min (with `maxDuration` config) or 15min (Fluid Compute). Use Inngest for steps that can take minutes/hours. Inngest free tier handles this.

## Definition of done

You connect a real HubSpot account with 1,000+ contacts, click Import, walk away, and 30 minutes later receive an email saying "Done." When you log in, all your contacts/companies/deals are present with associations intact and at least 90% of fields mapped correctly.
