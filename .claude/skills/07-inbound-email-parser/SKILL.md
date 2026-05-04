# SKILL: 07-inbound-email-parser

**Inherits:** `base-context/SKILL.md`
**Depends on:** `02-contacts-module`, `05-email-send`
**Build difficulty:** 4/5
**Estimated time:** 2-3 sessions

## Goal

Receive emails sent to each workspace's unique BCC dropbox address, parse them, match to existing contacts (or create new ones), attach as activities. This is how users log inbound replies and BCC'd outbound emails into the CRM without needing read access to their Gmail.

## Acceptance criteria

- [ ] MX records configured for `log.yourdomain.com` pointing to inbound provider (Resend Inbound or AWS SES + S3 + Lambda)
- [ ] Webhook endpoint receives parsed JSON payload from inbound provider
- [ ] Webhook validates signature/secret to prevent forgery
- [ ] Workspace identified from `+slug` portion of address (e.g. `log+ws_a3f9k2@log.yourdomain.com` → workspace with `dropbox_slug = 'ws_a3f9k2'`)
- [ ] Sender email extracted, looked up in contacts, contact auto-created if missing
- [ ] Email message saved with direction='in', linked to contact
- [ ] Email body cleaned: forwarded headers stripped, quoted replies collapsed, signatures separated
- [ ] Attachments saved to Supabase Storage, referenced from email_messages
- [ ] Activity row created so it shows up in contact timeline
- [ ] Settings page shows the workspace's dropbox address with "Copy" button
- [ ] Test: send a real email to the dropbox address, see it appear in CRM within 30 seconds
- [ ] All meta acceptance criteria

## Files to create

```
src/db/schema/email-attachments.ts
src/db/migrations/0007_inbound_email.sql

src/app/api/webhooks/inbound-email/route.ts
src/app/(app)/settings/email-dropbox/page.tsx

src/server/queries/email-messages.ts

src/components/settings/dropbox-address-card.tsx

src/lib/email/inbound-parser.ts                  (parse webhook payload)
src/lib/email/body-cleaner.ts                    (strip quotes, signatures)
src/lib/email/match-contact.ts
```

## Inbound provider choice

**Recommended: Resend Inbound** (when generally available; check status). Otherwise:

**Alternative: Cloudflare Email Workers** (free, simple to set up, parses MIME for you).

**Fallback: AWS SES Inbound + Lambda → SQS → your webhook.** More setup, more reliable.

For MVP, use Cloudflare Email Workers if not on AWS already. It's free and well-documented:
1. Add MX record for `log.yourdomain.com` pointing to Cloudflare's mail servers
2. Create an Email Worker that POSTs the parsed message to your webhook endpoint
3. Worker code is ~30 lines

## Webhook payload (normalized)

After parsing in your worker/handler, you should pass a normalized object to your business logic:

```typescript
type InboundEmail = {
  to: string                    // 'log+ws_a3f9k2@log.yourdomain.com'
  from: { email: string; name?: string }
  subject: string
  receivedAt: Date
  messageId: string             // RFC Message-ID from headers
  inReplyTo?: string
  references?: string[]
  bodyText: string
  bodyHtml: string
  attachments: Array<{
    filename: string
    contentType: string
    sizeBytes: number
    contentBase64: string
  }>
  rawHeaders: Record<string, string>
}
```

## Webhook handler logic

```typescript
export async function POST(req: Request) {
  // 1. Validate signature
  const signature = req.headers.get('x-webhook-signature')
  if (!verifyWebhookSignature(signature, await req.text())) {
    return new Response('Invalid signature', { status: 401 })
  }
  
  const email: InboundEmail = parseWebhookPayload(req)
  
  // 2. Extract workspace from To address
  const slug = extractDropboxSlug(email.to) // 'ws_a3f9k2'
  if (!slug) return new Response('Invalid address', { status: 400 })
  
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.dropboxSlug, slug)
  })
  if (!workspace) return new Response('Unknown workspace', { status: 404 })
  
  // 3. Match or create contact
  const contact = await matchOrCreateContact(workspace.id, email.from)
  
  // 4. Clean body
  const cleaned = cleanEmailBody(email.bodyHtml, email.bodyText)
  
  // 5. Save email message
  const [message] = await db.insert(emailMessages).values({
    workspaceId: workspace.id,
    contactId: contact.id,
    direction: 'in',
    subject: email.subject,
    bodyHtml: cleaned.html,
    bodyText: cleaned.text,
    fromAddress: email.from.email,
    toAddresses: [email.to],
    messageId: email.messageId,
    inReplyTo: email.inReplyTo,
    receivedAt: email.receivedAt,
  }).returning()
  
  // 6. Save attachments to Supabase Storage
  for (const att of email.attachments) {
    const path = `attachments/${workspace.id}/${message.id}/${att.filename}`
    await supabase.storage.from('email-attachments').upload(
      path,
      Buffer.from(att.contentBase64, 'base64'),
      { contentType: att.contentType, upsert: false }
    )
    await db.insert(emailAttachments).values({
      workspaceId: workspace.id,
      messageId: message.id,
      filename: att.filename,
      contentType: att.contentType,
      sizeBytes: att.sizeBytes,
      storagePath: path,
    })
  }
  
  // 7. Create activity row
  await db.insert(activities).values({
    workspaceId: workspace.id,
    type: 'email',
    contactId: contact.id,
    body: email.subject,
    metadata: { messageId: message.id, direction: 'in' },
  })
  
  return new Response('OK', { status: 200 })
}
```

## Body cleaning logic

```typescript
// src/lib/email/body-cleaner.ts

const QUOTE_DIVIDERS = [
  /^On .+ wrote:$/m,
  /^From: .+\nSent: .+/m,
  /^-----Original Message-----/m,
  /^>+\s/m, // quote indicators
]

export function cleanEmailBody(html: string, text: string) {
  // Strategy: find the first quote divider, cut everything after it
  // This is naive but works for ~90% of common email clients
  
  let cleanedText = text
  for (const divider of QUOTE_DIVIDERS) {
    const match = cleanedText.match(divider)
    if (match && match.index) {
      cleanedText = cleanedText.slice(0, match.index).trim()
      break
    }
  }
  
  // For HTML, we look for the gmail_quote class and similar
  let cleanedHtml = html
    .replace(/<blockquote[^>]*class="gmail_quote"[\s\S]*?<\/blockquote>/g, '')
    .replace(/<div[^>]*id="reply-intro"[\s\S]*?(?=<\/div>)<\/div>[\s\S]*$/g, '')
  
  return { text: cleanedText, html: cleanedHtml }
}
```

This is heuristic. It will get edge cases wrong. That's acceptable at MVP — log a warning when cleaning fails dramatically (e.g. cleaned text is empty but original had content) and show the user "Show full message" toggle.

## Contact matching

```typescript
// src/lib/email/match-contact.ts

export async function matchOrCreateContact(
  workspaceId: string,
  from: { email: string; name?: string }
): Promise<Contact> {
  // 1. Try email match
  const existing = await db.query.contacts.findFirst({
    where: and(
      eq(contacts.workspaceId, workspaceId),
      eq(contacts.email, from.email.toLowerCase()),
      isNull(contacts.deletedAt),
    ),
  })
  if (existing) return existing
  
  // 2. Create new contact
  const { firstName, lastName } = parseFromName(from.name, from.email)
  
  // Auto-link to company via domain
  const companyLink = await autoLinkContactToCompany(workspaceId, from.email)
  
  const [contact] = await db.insert(contacts).values({
    workspaceId,
    email: from.email.toLowerCase(),
    firstName,
    lastName,
    companyId: companyLink?.companyId,
    source: 'email_dropbox',
    lifecycleStage: 'lead',
  }).returning()
  
  return contact
}

function parseFromName(displayName: string | undefined, email: string) {
  if (displayName) {
    const parts = displayName.replace(/['"]/g, '').trim().split(/\s+/)
    return {
      firstName: parts[0],
      lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
    }
  }
  // Fallback: derive from email local part
  const local = email.split('@')[0]
  const cleaned = local.replace(/[._-]/g, ' ')
  const parts = cleaned.split(/\s+/)
  return {
    firstName: capitalize(parts[0]) ?? null,
    lastName: parts.length > 1 ? capitalize(parts.slice(1).join(' ')) : null,
  }
}
```

## Settings page

`/settings/email-dropbox`:

- Big card with the dropbox address: `log+ws_a3f9k2@log.yourdomain.com`
- "Copy" button (uses navigator.clipboard)
- Instructions:
  > BCC this address on outgoing emails to log them automatically.
  > Forward client replies to this address to attach them to the contact's timeline.
- "Recent inbound emails" list (last 10) with status (matched / created new contact / failed)
- Help link: troubleshooting common issues (forwarded headers, attachments)

## Out of scope

- Two-way sync with the user's actual inbox (would need restricted scopes)
- Threading replies into Gmail's existing thread
- Auto-reply to the dropbox (user shouldn't reply to the dropbox)
- AI summarization of long threads

## Test plan

1. **Real email roundtrip:** Send a test email from your personal Gmail to the dropbox address → within 60s, contact is created and email appears in their timeline
2. **Existing contact:** Email from an existing contact's address → no duplicate created, activity attached to existing contact
3. **Forwarded email:** Forward a real client email → sender is the original client, not you (because you're forwarding) → BUT the body is cleaned of forwarded headers
4. **BCC scenario:** Send an email from your Gmail to a real recipient AND BCC the dropbox → email logged to recipient (the To address contact, not your own)
5. **Attachments:** Send email with PDF attachment → attachment saved to Storage, referenced in DB, viewable from contact page
6. **Spam/noise:** Send fake email purporting to be from `boss@megacorp.com` to your dropbox (without proper SPF) → still logged but flag in metadata that SPF failed (so user knows it might not be legit)
7. **Workspace isolation:** Email to workspace A's dropbox doesn't appear in workspace B

## Common pitfalls

- **BCC vs TO logic:** when user BCCs the dropbox, the From is them and the To is the recipient. Your logic should detect this case (sender email matches a connected user) and link to the recipient contact, not the sender.
- **Reply chain matching:** if the email has `In-Reply-To` referencing a previously sent email, link to the same contact thread.
- **Attachment size:** Cap at 25MB per attachment, 50MB per email. Reject larger and notify user.
- **Spam protection:** add a rate limit on inbound from the same sender (max 100/hour) so a runaway forwarding loop doesn't trash your DB.
- **DKIM/SPF validation:** if the inbound provider gives you SPF/DKIM result, store it. Don't reject failures (forwards often fail) but flag them.
- **HTML sanitization:** when displaying the email body in the contact timeline, sanitize HTML with DOMPurify. Inbound HTML can contain malicious scripts.

## Definition of done

You can BCC the dropbox on a real email from your phone, and within a minute see it logged in the right contact's timeline with sender, subject, and clean body.
