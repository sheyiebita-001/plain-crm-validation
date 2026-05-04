# SKILL: 05-email-send

**Inherits:** `base-context/SKILL.md`
**Depends on:** `02-contacts-module`, `04-deals-pipeline`
**Build difficulty:** 3/5
**Estimated time:** 3-4 sessions
**Important:** submit Google OAuth verification on Day 1 of building this skill. The verification process takes 1-3 weeks. While waiting, the app stays in "unverified" mode (max 100 test users) which is fine for beta.

## Goal

Let users connect their Google account and send tracked emails from their own Gmail. Tracking includes 1×1 pixel for opens and link rewriting for clicks. Sent emails are logged to the relevant contact and deal.

## Acceptance criteria

- [ ] OAuth connections table with workspace_id, encrypted token storage, RLS
- [ ] User can connect Google from `/settings/integrations/google` 
- [ ] OAuth scopes requested: `gmail.send`, `gmail.compose`, `userinfo.email`, `userinfo.profile` (NO restricted scopes)
- [ ] Disconnect button revokes tokens server-side
- [ ] "Email" button on contact detail opens compose modal
- [ ] Compose modal has: To (auto-filled from contact), Subject, Body (rich text), Send button, "Save as draft" (Phase 2)
- [ ] Body editor uses TipTap with basic formatting: bold, italic, link, bullet/numbered list
- [ ] Tracking pixel injected at end of HTML body
- [ ] All `<a href="...">` rewritten to point to `/api/track/click/[message_id]?u=[encoded_url]`
- [ ] On send: email sent via Gmail API; `email_messages` row created with direction=out
- [ ] Sent email appears in contact's activity timeline immediately
- [ ] Open tracking endpoint logs `opened_at` and `opens` count, returns transparent 1×1 GIF
- [ ] Click tracking endpoint logs `clicked_at` and redirects to original URL
- [ ] Token refresh handled by hourly cron
- [ ] All meta acceptance criteria

## Files to create

```
src/db/schema/oauth-connections.ts
src/db/schema/email-messages.ts
src/db/migrations/0005_email.sql

src/app/(app)/settings/integrations/google/page.tsx
src/app/api/oauth/google/callback/route.ts
src/app/api/track/open/[messageId]/route.ts
src/app/api/track/click/[messageId]/route.ts

src/server/actions/google-oauth.ts
src/server/actions/email-send.ts

src/components/email/compose-modal.tsx
src/components/email/email-editor.tsx           (TipTap wrapper)
src/components/email/google-connect-card.tsx

src/lib/google/oauth-client.ts
src/lib/google/gmail.ts                          (Gmail API wrapper)
src/lib/email/tracking.ts                        (pixel injection, link rewriting)
src/lib/email/mime-builder.ts                    (RFC 2822 builder)
src/lib/encryption.ts                            (encrypt/decrypt tokens)
```

## Database schema

```typescript
export const oauthConnections = pgTable('oauth_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  
  provider: text('provider').notNull(), // 'google' | 'microsoft' | 'hubspot'
  providerEmail: text('provider_email'),
  
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted'),
  expiresAt: timestamp('expires_at'),
  scopes: text('scopes').array(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  workspaceProviderIdx: uniqueIndex('oauth_workspace_provider_idx').on(
    table.workspaceId, table.userId, table.provider
  ),
}))

export const emailMessages = pgTable('email_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
  
  direction: text('direction').notNull(), // 'in' | 'out'
  
  subject: text('subject'),
  bodyHtml: text('body_html'),
  bodyText: text('body_text'),
  
  fromAddress: text('from_address').notNull(),
  toAddresses: jsonb('to_addresses').notNull(), // string[]
  ccAddresses: jsonb('cc_addresses'),
  
  messageId: text('message_id'), // RFC Message-ID header
  threadId: text('thread_id'),    // Gmail thread ID
  inReplyTo: text('in_reply_to'),
  
  opens: integer('opens').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  openedAt: timestamp('opened_at'),
  firstClickedAt: timestamp('first_clicked_at'),
  
  sentAt: timestamp('sent_at'),
  receivedAt: timestamp('received_at'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('email_messages_workspace_idx').on(table.workspaceId),
  contactIdx: index('email_messages_contact_idx').on(table.contactId),
}))
```

## Token encryption

Use `node:crypto` AES-256-GCM with a key from env var `ENCRYPTION_KEY` (32 bytes hex).

```typescript
// src/lib/encryption.ts
const ALGO = 'aes-256-gcm'
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function decrypt(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64')
  const iv = buf.subarray(0, 12)
  const authTag = buf.subarray(12, 28)
  const encrypted = buf.subarray(28)
  const decipher = createDecipheriv(ALGO, KEY, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
```

## OAuth flow

1. User clicks "Connect Google" → redirected to Google's authorize URL with scopes
2. Google redirects to `/api/oauth/google/callback?code=...`
3. Callback exchanges code for tokens
4. Tokens encrypted, saved in `oauth_connections`
5. User redirected to `/settings/integrations/google` with success toast

OAuth scopes (exactly these, no more):
```
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

`gmail.send` is sensitive but not restricted. No CASA audit. Standard verification only.

## Sending an email

```typescript
// src/server/actions/email-send.ts

export async function sendEmail(input: SendEmailInput) {
  const workspace = await getCurrentWorkspace()
  const validated = sendEmailSchema.parse(input)
  
  const connection = await getActiveGoogleConnection(workspace.id)
  if (!connection) throw new Error('Connect Gmail first')
  
  // Pre-create the message row to get the messageId for tracking
  const [message] = await db.insert(emailMessages).values({
    workspaceId: workspace.id,
    contactId: validated.contactId,
    dealId: validated.dealId,
    direction: 'out',
    subject: validated.subject,
    fromAddress: connection.providerEmail!,
    toAddresses: [validated.to],
    bodyHtml: validated.bodyHtml,
    bodyText: htmlToText(validated.bodyHtml),
  }).returning()
  
  // Inject tracking pixel and rewrite links
  const trackedHtml = injectTracking(validated.bodyHtml, message.id)
  
  // Build RFC 2822 message
  const raw = buildMimeMessage({
    from: connection.providerEmail!,
    to: validated.to,
    subject: validated.subject,
    html: trackedHtml,
    text: htmlToText(trackedHtml),
  })
  
  // Send via Gmail API
  const accessToken = await getValidAccessToken(connection)
  const result = await gmailClient.send(accessToken, raw)
  
  // Update with Gmail's message ID and thread ID
  await db.update(emailMessages).set({
    messageId: result.id,
    threadId: result.threadId,
    sentAt: new Date(),
  }).where(eq(emailMessages.id, message.id))
  
  // Create activity row for timeline
  await db.insert(activities).values({
    workspaceId: workspace.id,
    type: 'email',
    contactId: validated.contactId,
    dealId: validated.dealId,
    body: validated.subject,
    metadata: { messageId: message.id },
  })
  
  return { messageId: message.id }
}
```

## Tracking pixel injection

```typescript
// src/lib/email/tracking.ts

export function injectTracking(html: string, messageId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!
  
  // Rewrite all <a> hrefs
  const withRewrittenLinks = html.replace(
    /<a([^>]+)href="([^"]+)"/g,
    (match, attrs, url) => {
      // Don't rewrite anchor links or mailto
      if (url.startsWith('#') || url.startsWith('mailto:')) return match
      const tracked = `${baseUrl}/api/track/click/${messageId}?u=${encodeURIComponent(url)}`
      return `<a${attrs}href="${tracked}"`
    }
  )
  
  // Append pixel before </body> or at end
  const pixel = `<img src="${baseUrl}/api/track/open/${messageId}" width="1" height="1" alt="" style="display:block;border:0;" />`
  
  if (withRewrittenLinks.includes('</body>')) {
    return withRewrittenLinks.replace('</body>', `${pixel}</body>`)
  }
  return withRewrittenLinks + pixel
}
```

## Tracking endpoints

```typescript
// /api/track/open/[messageId]
export async function GET(req: Request, { params }: { params: { messageId: string }}) {
  // Don't await - log async, return pixel immediately
  logOpen(params.messageId).catch(console.error)
  
  return new Response(TRANSPARENT_GIF_BYTES, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    },
  })
}

// /api/track/click/[messageId]
export async function GET(req: Request, { params }: { params: { messageId: string }}) {
  const url = new URL(req.url)
  const target = url.searchParams.get('u')
  if (!target) return new Response('Missing target', { status: 400 })
  
  logClick(params.messageId).catch(console.error)
  
  return Response.redirect(decodeURIComponent(target), 302)
}
```

These endpoints don't require auth — they're called from email clients. They DO need to validate the messageId exists and belongs to a real workspace (to prevent abuse).

## Open tracking caveats (be honest about these)

- Gmail caches images via Google's proxy. The first open IS counted, but subsequent opens from the same recipient may not register because Gmail serves the cached pixel.
- Apple Mail Privacy Protection (iOS 15+) pre-fetches all images, inflating open counts. About 30-50% of "opens" from Apple Mail are bots.
- Document this in the UI: "Open rates are indicative, not exact."

## Token refresh

Cron job runs hourly:

```typescript
// src/lib/google/refresh-cron.ts

export async function refreshExpiringTokens() {
  const expiring = await db.query.oauthConnections.findMany({
    where: and(
      eq(oauthConnections.provider, 'google'),
      lt(oauthConnections.expiresAt, new Date(Date.now() + 30 * 60 * 1000)) // 30 min ahead
    ),
  })
  
  for (const conn of expiring) {
    try {
      const refreshToken = decrypt(conn.refreshTokenEncrypted!)
      const newTokens = await google.refreshAccessToken(refreshToken)
      await db.update(oauthConnections).set({
        accessTokenEncrypted: encrypt(newTokens.access_token),
        expiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
      }).where(eq(oauthConnections.id, conn.id))
    } catch (err) {
      // Token revoked by user. Mark connection as broken.
      console.error('Token refresh failed', err)
    }
  }
}
```

## UI requirements

### Connect Google card
- Settings → Integrations → Google
- Logo, status (Not connected | Connected as user@example.com | Token expired)
- "Connect Google" button → starts OAuth
- "Disconnect" button (when connected) with confirmation

### Compose modal
- Triggered by "Email" button on contact detail
- Header: "To: Sarah Chen <sarah@acme.com>"
- Subject input
- Editor (TipTap with toolbar)
- Insert template dropdown (skill 06)
- Bottom bar: "Send" button (primary), "Cancel" (ghost)
- Loading state on send (10-30 seconds typical)
- Success toast → close modal → contact timeline shows new email immediately

## Out of scope (Phase 2)

- Drafts and scheduled send
- Email replies (would need gmail.readonly — restricted scope)
- Attachment uploads
- Send sequences (multi-step)
- A/B testing subject lines
- Inbox view inside CRM (also restricted scope)

## Test plan

1. **OAuth connect:** Click connect → Google consent screen shows correct scopes (Send only, no read) → Approve → redirected back → status shows "Connected as your-email@gmail.com"
2. **Send email:** Compose to a contact → send → email arrives in their real inbox AND appears in their Gmail Sent folder → activity logged in CRM
3. **Open tracking:** Open the email yourself → wait 5 sec → contact timeline shows "Opened" indicator
4. **Click tracking:** Add a link in compose, send, click in inbox → redirected to original URL → CRM shows click logged
5. **Token refresh:** Manually expire a token in DB → next API call → refresh runs → request succeeds
6. **Token revoke:** Revoke from your Google account → next send → graceful error: "Reconnect Google"
7. **Pixel cache:** Send to Gmail → Gmail's image proxy fetches pixel → open count increments correctly

## Common pitfalls

- **Sender encoding:** UTF-8 throughout. Subject lines need RFC 2047 encoded-word for non-ASCII.
- **Quoted-printable body:** if you send raw HTML over 78 chars/line, some servers wrap awkwardly. Use base64 encoding for HTML bodies.
- **Pixel size:** must be 1×1 GIF, transparent, ~43 bytes. Don't use SVG (Gmail blocks SVG inline).
- **Cache headers:** the pixel response MUST include `Cache-Control: no-store` or Gmail proxy will only fetch once and you miss subsequent opens.
- **Click rewriting edge cases:** unsubscribe links, mailto:, anchor links, links inside `<style>` blocks. Test each.
- **Don't rewrite links pointing to your own tracking domain.** Loops.
- **Google verification gotcha:** during verification, Google requires a privacy policy URL and a homepage URL hosted on the OAuth client's authorized domain. Have these live before submitting.

## Definition of done

You connect your own Gmail, send a tracked email to a test contact, and see the open + click logged in the contact's timeline within 30 seconds of the recipient interacting with it.
