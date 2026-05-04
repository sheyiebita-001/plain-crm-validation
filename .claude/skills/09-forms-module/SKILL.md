# SKILL: 09-forms-module

**Inherits:** `base-context/SKILL.md`
**Depends on:** `02-contacts-module`
**Build difficulty:** 3/5
**Estimated time:** 2 sessions

## Goal

Form builder users can drop on their websites to capture leads. Submissions create contacts and log activities. Includes anti-spam protection.

## Acceptance criteria

- [ ] Forms table with workspace_id and RLS
- [ ] Form submissions table linked to forms and contacts
- [ ] Form builder at `/settings/forms` with drag-to-reorder fields
- [ ] Field types supported: text, email, phone, textarea, dropdown, checkbox, hidden
- [ ] Required field validation (client + server)
- [ ] Embed widget: one-line `<script>` snippet that injects an iframe
- [ ] Embedded form is responsive and inherits parent fonts where possible
- [ ] Public form route at `/f/[slug]` for direct linking
- [ ] Submissions create or update contact, attach activity row
- [ ] Honeypot field for spam (hidden field that bots fill)
- [ ] Cloudflare Turnstile integration (free CAPTCHA)
- [ ] Submission count visible per form
- [ ] Submission list view per form with export to CSV
- [ ] All meta acceptance criteria

## Files to create

```
src/db/schema/forms.ts
src/db/schema/form-submissions.ts
src/db/migrations/0009_forms.sql

src/app/(public)/f/[slug]/page.tsx
src/app/api/forms/[id]/submit/route.ts
src/app/api/forms/[id]/widget.js/route.ts        (serves the embed JS)

src/app/(app)/settings/forms/page.tsx
src/app/(app)/settings/forms/[id]/page.tsx
src/app/(app)/settings/forms/[id]/submissions/page.tsx

src/server/actions/forms.ts

src/components/forms/form-builder.tsx
src/components/forms/field-editor.tsx
src/components/forms/field-types.tsx              (renderers)
src/components/forms/embed-snippet.tsx
src/components/forms/public-form.tsx              (renders the form for embed)
src/components/forms/submissions-list.tsx

src/lib/forms/schemas.ts
src/lib/forms/submission-handler.ts
```

## Database schema

```typescript
export const forms = pgTable('forms', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  
  // Form fields config — array of { id, type, label, name, required, placeholder, options? }
  fields: jsonb('fields').notNull().default([]),
  
  successMessage: text('success_message').notNull().default('Thanks! We\'ll be in touch.'),
  redirectUrl: text('redirect_url'), // optional
  
  // Map form field name → contact property
  // e.g. { "name": "firstName", "email": "email", "msg": null /* goes to activity */ }
  fieldMapping: jsonb('field_mapping').notNull().default({}),
  
  // Default lifecycle stage for created contacts
  defaultLifecycleStage: text('default_lifecycle_stage').default('lead'),
  
  // Anti-spam settings
  honeypotEnabled: boolean('honeypot_enabled').notNull().default(true),
  turnstileEnabled: boolean('turnstile_enabled').notNull().default(false),
  
  active: boolean('active').notNull().default(true),
  submissionCount: integer('submission_count').notNull().default(0),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  slugIdx: uniqueIndex('forms_workspace_slug_idx').on(table.workspaceId, table.slug),
}))

export const formSubmissions = pgTable('form_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  formId: uuid('form_id').notNull().references(() => forms.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  
  payload: jsonb('payload').notNull(), // raw submitted data
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  pageUrl: text('page_url'), // referer
  
  isSpam: boolean('is_spam').notNull().default(false),
  spamReason: text('spam_reason'),
  
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
}, (table) => ({
  formIdx: index('form_submissions_form_idx').on(table.formId),
}))
```

## Embed widget

The widget script (`/api/forms/[id]/widget.js`) returns JavaScript that creates an iframe:

```javascript
// Served by /api/forms/[id]/widget.js
(function() {
  var formId = "{{FORM_ID}}";
  var origin = "{{ORIGIN}}";
  
  var iframe = document.createElement('iframe');
  iframe.src = origin + '/f/' + formId + '?embed=1';
  iframe.style.cssText = 'width:100%;border:0;min-height:400px;';
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('title', 'Contact form');
  
  // Find the script tag's parent and inject iframe before it
  var script = document.currentScript;
  if (script && script.parentNode) {
    script.parentNode.insertBefore(iframe, script);
  } else {
    document.body.appendChild(iframe);
  }
  
  // Auto-resize iframe based on content
  window.addEventListener('message', function(e) {
    if (e.origin !== origin) return;
    if (e.data && e.data.type === 'plaincrm:resize') {
      iframe.style.height = e.data.height + 'px';
    }
  });
})();
```

User's embed snippet (shown in UI):
```html
<script src="https://plaincrm.com/api/forms/abc-123/widget.js" async></script>
```

## Submission handler

```typescript
// src/app/api/forms/[id]/submit/route.ts

export async function POST(req: Request, { params }: { params: { id: string }}) {
  const formId = params.id
  
  // Rate limit by IP (10 submissions/min)
  const ip = getClientIp(req)
  if (await isRateLimited(ip)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 })
  }
  
  const body = await req.json()
  
  const form = await db.query.forms.findFirst({
    where: and(eq(forms.id, formId), eq(forms.active, true))
  })
  if (!form) return Response.json({ error: 'Form not found' }, { status: 404 })
  
  // Anti-spam checks
  const spamReason = await checkForSpam(form, body, req)
  
  // Validate against form schema
  const validated = validateAgainstFormSchema(form.fields, body)
  if (!validated.success) {
    return Response.json({ errors: validated.errors }, { status: 400 })
  }
  
  // Save submission
  const [submission] = await db.insert(formSubmissions).values({
    workspaceId: form.workspaceId,
    formId: form.id,
    payload: validated.data,
    ipAddress: ip,
    userAgent: req.headers.get('user-agent'),
    pageUrl: req.headers.get('referer'),
    isSpam: !!spamReason,
    spamReason,
  }).returning()
  
  if (spamReason) {
    return Response.json({ success: true, message: form.successMessage })
    // Return success even for spam so bots don't iterate
  }
  
  // Map fields to contact properties
  const contactData = mapFormFieldsToContact(form.fieldMapping, validated.data)
  
  // Find or create contact
  const contact = await findOrCreateContactFromForm(form.workspaceId, contactData)
  
  // Update submission with contact id
  await db.update(formSubmissions).set({ contactId: contact.id }).where(eq(formSubmissions.id, submission.id))
  
  // Log activity
  await db.insert(activities).values({
    workspaceId: form.workspaceId,
    type: 'note',
    contactId: contact.id,
    body: `Submitted form: ${form.name}`,
    metadata: { kind: 'form_submission', formId: form.id, submissionId: submission.id, payload: validated.data },
  })
  
  // Increment submission count
  await db.update(forms).set({ 
    submissionCount: sql`${forms.submissionCount} + 1`
  }).where(eq(forms.id, form.id))
  
  return Response.json({ 
    success: true, 
    message: form.successMessage,
    redirectUrl: form.redirectUrl,
  })
}
```

## Spam detection

```typescript
// src/lib/forms/spam-check.ts

export async function checkForSpam(
  form: Form, 
  body: Record<string, unknown>,
  req: Request
): Promise<string | null> {
  // 1. Honeypot: if hidden _hp field is non-empty, bot
  if (form.honeypotEnabled && body._hp) {
    return 'honeypot_filled'
  }
  
  // 2. Submission speed: if filled in <2 seconds, bot
  const formLoadedAt = body._loaded_at as number | undefined
  if (formLoadedAt && Date.now() - formLoadedAt < 2000) {
    return 'too_fast'
  }
  
  // 3. Turnstile token verification
  if (form.turnstileEnabled) {
    const token = body['cf-turnstile-response'] as string
    if (!token) return 'no_turnstile_token'
    const valid = await verifyTurnstile(token, getClientIp(req))
    if (!valid) return 'invalid_turnstile'
  }
  
  return null
}
```

## UI requirements

### Form builder
- Two-pane: left = field list (drag to reorder), right = live preview
- "+ Add field" dropdown with field types
- Click field → edit panel: label, name, required, placeholder, options (for dropdowns)
- Settings tab: success message, redirect URL, anti-spam options, field-to-contact-property mapping

### Embed snippet card
- After saving form, show:
  - Embed code with copy button
  - Direct link to `/f/[slug]`
  - Preview link
- "Test submission" button that fills with dummy data

### Submissions list
- Table with: submitted date, contact name (linked), preview of payload (first 2 fields), spam badge
- Filter: this week / last week / all time / spam only
- Export CSV

## Out of scope

- Multi-page forms / wizards
- Conditional logic (show field B if field A = X)
- File uploads (Phase 2)
- Payment-collecting forms (Phase 2)
- Form A/B testing
- Workflow triggers on submission (Phase 2 — requires workflow engine)

## Test plan

1. **Create form:** Build with name, email, message → save → embed code visible
2. **Embed test:** Paste embed code on a sandbox HTML page → form renders, styled correctly
3. **Submit:** Fill form, submit → success message shown → contact created in CRM, activity logged
4. **Update vs create:** Submit twice with same email → no duplicate contact, second submission creates a new activity on existing contact
5. **Honeypot:** Submit with `_hp` filled → returns success but flagged as spam, no contact created
6. **Required field:** Submit without required field → 400 error with field-specific message
7. **Rate limit:** Submit 11 times rapidly from same IP → last one returns 429
8. **Turnstile:** Enable Turnstile → submit without token → rejected; submit with valid token → accepted
9. **Workspace isolation:** Form in workspace A is not accessible via workspace B's slug

## Common pitfalls

- **CORS for the submit endpoint:** must allow cross-origin POST since the form is embedded on user's website. Use `Access-Control-Allow-Origin: *` for the submit endpoint specifically (not other endpoints).
- **iframe height communication:** the embedded form needs to postMessage its height to the parent so the iframe resizes. Use `window.parent.postMessage` from the public form page.
- **Cookie/storage in iframe:** Safari blocks third-party cookies inside iframes by default. Don't rely on cookies in the embed; use sessionStorage scoped to the iframe origin.
- **Turnstile dom rendering:** Cloudflare Turnstile widget needs `cf-turnstile` div. Render it conditionally based on form settings.
- **Field name vs label:** keep these separate. Label is what the user sees, name is what's submitted. Don't auto-derive name from label after creation (breaks existing submissions).

## Definition of done

You build a contact form, embed it on a sample external HTML page (run via `npx serve`), submit it from that page, and see the contact appear in your CRM with all data attached.
