# SKILL: 00-validation-campaign

**Build difficulty:** 3/5 (orchestration + light custom code)
**Estimated time:** 1 week setup, 4 weeks campaign run
**Status:** Active. This skill runs in parallel with product build skills 01-12.

## What we're validating

Whether HubSpot users — specifically dissatisfied ones — will pay for a flat-priced CRM alternative. Output is a data-backed go/no-go decision plus a launch-ready customer list.

## Confirmed setup

- **Sender identity:** Sheyi A <sheyi@trysignalbench.com>
- **Sending domain:** `trysignalbench.com` (warmup started April 11 via Warmbox.ai — past 14-day minimum on April 25)
- **Sending tool:** Smartlead Basic ($39/mo)
- **Warmup tool:** Warmbox.ai (continues running in parallel with Smartlead)
- **Landing page domain:** `trysignalbench.com` (also acts as "feedback site" — separate from future product domain)
- **Database:** Supabase (same stack as product build, free tier)
- **Hosting:** Vercel (free tier)
- **Lead gen:** Apify (existing account)
- **Enrichment:** Apollo or Hunter free tier (sign up only when needed in week 2)

## Closed-loop architecture

```
[Apify scrapers]
    ↓ (CSV exports)
[Apollo/Hunter enrichment]
    ↓ (verified emails)
[Smartlead lead lists]
    ↓ (sends 4-email sequence)
[Smartlead webhooks: opens, clicks, replies, unsubscribes]
    ↓
[Next.js API at trysignalbench.com/api/webhooks/smartlead]
    ↓
[Supabase tables: prospects, events, replies, survey_responses]
    ↓
[Admin dashboard at trysignalbench.com/admin]
    ↓
[Tier 1/2/3 metrics → go/no-go decision]
```

Every email event lands in your DB automatically. No manual data entry. Opt-outs propagate to Smartlead within 60 seconds via API to ensure compliance.

## The from-name framing

Email comes from `Sheyi A <sheyi@trysignalbench.com>`. The product is NOT called "Signal Bench" — that's just the feedback site domain. Emails refer to:

- **The sender:** "I'm Sheyi, working on a CRM project"
- **The feedback site:** "trysignalbench.com is where I'm collecting feedback"
- **The future product:** "I'm building a CRM for [audience]" (no brand name yet)

This honest framing performs better than fake corporate identity, and protects you from locking into a name before validation data tells you what to call it.

---

## Decision metrics (the whole point)

After ~500-1000 emails sent over 3-4 weeks, evaluate against these thresholds.

### Tier 1 — Engagement (does anyone care?)

| Metric | Concerning | Healthy | Strong |
|---|---|---|---|
| Open rate | <40% | 40-55% | >55% |
| Click rate | <3% | 3-8% | >8% |
| Reply rate | <2% | 2-5% | >5% |
| Bounce rate | >3% | 1-3% | <1% |

### Tier 2 — Intent (do they want it?)

| Metric | Concerning | Healthy | Strong |
|---|---|---|---|
| Form completion (of clickers) | <15% | 15-30% | >30% |
| Discovery call booking (of clickers) | <2% | 2-5% | >5% |
| Discovery call show rate | <50% | 50-70% | >70% |
| "Yes I'd pay" (of survey takers) | <30% | 30-50% | >50% |

### Tier 3 — Commercial (will they pay?)

| Metric | Concerning | Healthy | Strong |
|---|---|---|---|
| Median willingness-to-pay | <£100 once | £100-200 + £15-25/mo | >£200 + £20+/mo |
| Lifetime deal pre-orders | 0-2 | 3-10 | >10 |
| Beta commitments (verbal) | <3 | 5-10 | >10 with deposits |

### Decision rules

- **Build it:** 2/3 tiers in Strong, Tier 3 confirmed
- **Probably build it:** All 3 tiers Healthy, ≥5 verbal commitments
- **Pivot message:** Tier 1 Healthy, Tier 2 Concerning (engage but don't convert)
- **Pivot audience:** Tier 1 Concerning (wrong people)
- **Don't build it:** Tier 1 Healthy, Tier 3 Concerning (engagement without willingness to pay)

These rules are non-negotiable. If data says don't build, you don't build — pivot or quit. The whole point of this skill is to find that out cheaply, before sinking 8 weeks into the product.

---

## Database schema (Supabase)

```sql
-- prospects: one row per person we email
CREATE TABLE prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  company_size TEXT,
  job_title TEXT,
  source TEXT NOT NULL,            -- 'trustpilot' | 'g2' | 'reddit' | 'capterra' | 'linkedin'
  source_url TEXT,
  source_snippet TEXT,             -- the complaint we found, paraphrased
  smartlead_id TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- 'new' | 'sequenced' | 'replied' | 'unsubscribed' | 'bounced' | 'converted' | 'lost'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prospects_status ON prospects(status);
CREATE INDEX idx_prospects_email ON prospects(email);

-- events: every email interaction
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,        -- 'sent' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'unsubscribed'
  sequence_step INTEGER,           -- 1, 2, 3, 4
  metadata JSONB,                  -- raw smartlead webhook payload
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_prospect ON events(prospect_id);
CREATE INDEX idx_events_type_time ON events(event_type, occurred_at);

-- replies: full reply text for AI/manual analysis
CREATE TABLE replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  reply_text TEXT NOT NULL,
  classification TEXT,             -- 'hot' | 'warm' | 'soft_no' | 'hard_no' | 'unsubscribe' | NULL (unclassified)
  classified_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  notes TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- survey_responses: from the landing page form
CREATE TABLE survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT,
  company TEXT,
  current_crm TEXT,
  biggest_frustration TEXT,
  top_features JSONB,              -- array of feature IDs voted for
  willing_to_pay TEXT,             -- '<100' | '100-200' | '200-300' | '300+' | 'other'
  willing_to_pay_other TEXT,
  wants_call BOOLEAN DEFAULT FALSE,
  utm_source TEXT,
  utm_medium TEXT,
  ip_address TEXT,
  user_agent TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- suppression_list: opt-outs, hard bounces, complaints. Never email these again.
CREATE TABLE suppression_list (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,            -- 'unsubscribe' | 'bounce' | 'complaint' | 'manual'
  added_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## What gets built (the deliverables)

### 1. Landing page at `trysignalbench.com`

**Public pages:**
- `/` — hero, problem, solution sketch, feature voting, willingness-to-pay survey, signup form, founder note
- `/thanks` — post-signup confirmation
- `/unsubscribe/[token]` — one-click unsubscribe (auto-adds to suppression_list)
- `/privacy` — privacy policy

**API routes:**
- `POST /api/waitlist` — handles form submission → writes to survey_responses + prospects
- `POST /api/webhooks/smartlead` — receives Smartlead events → writes to events table, auto-handles unsubscribes
- `GET /api/track/click/:eventId` — click tracking (if needed beyond Smartlead's)

**Admin dashboard at `/admin`:**
- Auth-gated to `sheyi@trysignalbench.com` only (Supabase Auth, magic link)
- Tier 1/2/3 metrics displayed live
- Recent replies table with classification controls
- Survey response viewer with theme tagging
- Decision rule status: "Currently signaling: BUILD IT" / "PROBABLY BUILD" / "PIVOT MESSAGE" / etc.
- Suppression list manager

### 2. Smartlead campaign

- 1 campaign with 4-email sequence
- Lead lists imported from Apify+Apollo workflow
- Webhooks configured to POST to `https://trysignalbench.com/api/webhooks/smartlead`
- Stop-on-reply enabled
- Daily limit per inbox: 30 first week, scale to 50

### 3. Apify scraping configuration

- Trustpilot scraper for HubSpot reviews ≤3 stars
- G2 scraper for HubSpot negative reviews
- Reddit scraper for r/HubSpot complaint posts
- Output → CSV → Apollo/Hunter enrichment → Smartlead import

---

## Email sequence (final copy)

All emails plain text or minimal HTML. NO logos, NO fancy formatting. Reads like a human typed it on phone.

### Email 1 — Day 1 — Pain hook

```
Subject: quick question about hubspot, {{first_name}}

hi {{first_name}},

came across your review on trustpilot mentioning {{paraphrased_complaint}}.

genuine question — how much of {{company}}'s monthly software budget 
goes to hubspot now vs. when you started?

asking because i'm researching this exact problem for a project. 
worth a 2-min back-and-forth?

cheers,
sheyi
```

### Email 2 — Day 4 — What I'm building

```
Subject: re: quick question about hubspot

{{first_name}},

following up — quick context.

i'm building a CRM with flat pricing. one-time setup fee, fixed 
monthly forever. no contact tax, no seat tax, no auto-renewal traps. 

aimed at solo operators and small teams getting priced out of hubspot.

i've got a feedback site running at trysignalbench.com — 90 seconds, 
tells you what's coming and lets you vote on features that matter.

would your input help shape what i build? 

sheyi
```

### Email 3 — Day 8 — The link

```
Subject: 90-sec form on what's broken

{{first_name}},

here's the form: https://trysignalbench.com

vote on features. tell me what you'd actually pay. 60-90 seconds. 
no spam — i read every reply.

if you'd rather chat, my calendar: {{cal_link}}

either way, appreciate the time.

sheyi
```

### Email 4 — Day 14 — Last touch + lifetime deal

```
Subject: last note, {{first_name}}

last email from me — promise.

for the first 50 people who give input now, i'm offering a lifetime 
deal: one payment, no monthly. less than two months at hubspot pro.

if interesting: https://trysignalbench.com  
if not: i'll stop emailing — no follow-up after this.

sheyi
```

### Compliance footer (every email)

```
---
why this email? you posted publicly about hubspot and i'm researching 
alternatives. don't want to hear from me? just reply "remove" or 
{{unsubscribe_link}}.

sheyi a · birmingham, uk
```

---

## Phased build order

### Phase 1 — Foundation (Days 1-2)

1. Supabase project created, schema deployed
2. Vercel project linked to Next.js repo, custom domain set to `trysignalbench.com`
3. Smartlead account active, inbox connected, webhook secret generated
4. Apollo or Hunter free tier signed up (just to claim the credits)

### Phase 2 — Landing page (Days 3-5) — CLAUDE CODE BUILDS

1. Next.js app scaffolded
2. Supabase client + schema migrations
3. Public landing page with form
4. `/api/waitlist` writing to DB
5. `/api/webhooks/smartlead` receiving events
6. `/admin` dashboard auth-gated, metrics live
7. Deploy to Vercel, verify `trysignalbench.com` resolves

### Phase 3 — Lead generation (Days 6-8) — HUMAN + APIFY

1. Run Trustpilot scraper for HubSpot reviews ≤3 stars
2. Run G2 scraper for negative reviews
3. Run Reddit scraper for r/HubSpot complaints
4. Enrich with Apollo (target: 500-1000 verified business emails)
5. Filter: drop personal domains, role-based addresses, >500-employee companies
6. Import cleaned CSV into Smartlead

### Phase 4 — Sequence configured (Day 9)

1. Smartlead campaign created with 4 emails
2. Variables `{{paraphrased_complaint}}` populated per-prospect from scraping
3. Webhook URL configured: `https://trysignalbench.com/api/webhooks/smartlead`
4. Test send to your own personal email, verify webhook fires correctly
5. Stop-on-reply enabled

### Phase 5 — Sending starts (Day 10 onwards)

1. First batch: 30/day for 5 working days = 150 emails (Tue-Thu only, sent 9-11am UK time)
2. Monitor bounce rate daily — if >3%, STOP, clean list
3. After 5 days clean: scale to 50/day
4. Continue 2-3 weeks until ~500-1000 emails sent

### Phase 6 — Daily ops (10 min/day for 4 weeks)

1. Open `/admin` dashboard
2. Triage new replies (manual classification: hot/warm/soft_no/hard_no/unsubscribe)
3. Respond to hot replies same day, warm within 24h
4. Book discovery calls for any "yes let's chat" replies
5. Watch metrics drift week-over-week

### Phase 7 — Weekly review (30 min, every Monday)

1. Tier 1/2/3 metrics snapshot
2. Compare to thresholds
3. Theme-tag new survey responses ("biggest frustration" patterns)
4. Note any pricing data points
5. Decide: continue, adjust copy, pivot, stop

### Phase 8 — Decision (End of week 4)

Hit one of:
- **Build it / Probably build:** Full speed on product skills 01-12, the waitlist becomes launch list
- **Pivot message:** Rewrite emails, restart with new positioning
- **Pivot audience:** New scraper targets, new lead list
- **Don't build:** Save the data, pivot to different idea

---

## Compliance: PECR + GDPR

You're a UK business sending B2B cold email. PECR's "soft opt-in / legitimate interest" applies for B2B.

Mandatory:
- Business emails only (no @gmail, @yahoo, @hotmail recipients)
- Clear sender identity in every email (your real name + UK address in footer)
- One-click unsubscribe link in every email
- Honour opt-outs within 24h, permanently
- Maintain global suppression list (the `suppression_list` table)
- Don't email companies in jurisdictions with stricter rules (DE, FR) without specific compliance review

The webhook handler MUST:
1. On unsubscribe event: add email to `suppression_list` AND call Smartlead API to remove from all active campaigns
2. On bounce event: add to `suppression_list` with reason='bounce'
3. On reply event: stop sequence (Smartlead handles this automatically if "stop on reply" enabled — verify it is)

This isn't legal advice. If campaign scales beyond 1k recipients or expands beyond UK, get a 30-min lawyer consult.

---

## Apify configuration

### Trustpilot

```
Actor: apify/trustpilot-reviews-scraper (or community equivalent)
Input:
  startUrls: ["https://www.trustpilot.com/review/hubspot.com"]
  maxReviews: 1000
  filterByRating: [1, 2, 3]
  filterByDate: last_12_months
Expected output: ~300-600 reviews with reviewer name + review text
```

### G2

```
Actor: apify/g2-reviews-scraper or community equivalent
Input:
  startUrls: ["https://www.g2.com/products/hubspot-marketing-hub/reviews"]
  filterByRating: [1, 2, 3]
  maxReviews: 500
```

### Reddit

```
Actor: apify/reddit-scraper-lite
Input:
  startUrls: [
    "https://reddit.com/r/HubSpot/search?q=price&restrict_sr=on",
    "https://reddit.com/r/HubSpot/search?q=alternative&restrict_sr=on",
    "https://reddit.com/r/HubSpot/search?q=cancel&restrict_sr=on"
  ]
  maxItems: 200
```

### Enrichment workflow

After scraping, you have names + companies (from review snippets) but few emails. Use:

1. **Apollo Search:** input each company + reviewer name → returns email + verified status
2. **Hunter.io fallback:** for misses, search company domain for that person
3. **NeverBounce free tier:** verify each email — drop unverifiable

Filter rules (apply hard):
- Drop @gmail.com, @yahoo.com, @hotmail.com, @outlook.com (personal)
- Drop info@, sales@, contact@, hello@ (role-based)
- Drop companies >500 employees (not ICP)
- Cross-reference against `suppression_list` — drop matches

Target final clean list: 500-1000 verified.

---

## Smartlead setup steps (HUMAN)

1. Sign up at smartlead.ai (Basic plan $39/mo)
2. Connect inbox: `sheyi@trysignalbench.com` via OAuth
3. Verify Smartlead can send (sends a test email to itself)
4. Create campaign: "HubSpot Refugees Validation"
5. Add 4 emails with copy from above section
6. Configure variables: `{{first_name}}`, `{{company}}`, `{{paraphrased_complaint}}`
7. Settings:
   - Stop on reply: ON
   - Daily limit: 30 (first week), 50 (after)
   - Sending window: Tue-Thu, 09:00-11:00 UK time
   - Tracking: opens ON, clicks ON
8. Webhooks (Settings → Integrations → Webhooks):
   - URL: `https://trysignalbench.com/api/webhooks/smartlead`
   - Events: sent, opened, clicked, replied, unsubscribed, bounced
   - Secret: generate one, save to `.env.local` as `SMARTLEAD_WEBHOOK_SECRET`
9. Test webhook: Smartlead has a "send test" button — verify it hits your endpoint and lands in DB
10. Connect Smartlead API key (Settings → API) to your env: `SMARTLEAD_API_KEY` for unsubscribe propagation

---

## Acceptance criteria (when this skill is "done")

- [ ] Supabase project live with schema deployed
- [ ] Landing page deployed at `trysignalbench.com`, mobile responsive, loads <1s
- [ ] Form submission writes to DB and sends confirmation email
- [ ] `/admin` dashboard auth-gated, shows live metrics
- [ ] Smartlead campaign configured with 4-email sequence
- [ ] Webhook tested end-to-end (Smartlead event → DB row in <5s)
- [ ] Unsubscribe propagation tested (DB → Smartlead API removes from campaign)
- [ ] At least 500 verified prospects imported into Smartlead
- [ ] First batch of 30 emails sent successfully
- [ ] Bounce rate <3%, reply rate >2% in first week
- [ ] After 4 weeks: a clear go/no-go decision documented

---

## Common pitfalls

- **Sending before warmup completes.** Warmbox needs at least 14 days. Sheyi's started April 11, so April 25 is the earliest. Don't push earlier.
- **Skipping list cleaning.** A bad list (high bounce) kills sender reputation in days. Spend the time on enrichment + verification.
- **Reply triage falling behind.** 10 min/day is the rule. If you can't keep up, lower the daily send rate.
- **Missing unsubscribe propagation.** If someone unsubscribes via the webhook but Smartlead doesn't know, they get email 2. That's a complaint waiting to happen. Test the API call works.
- **Building the dashboard before the webhook works.** Get data flowing into the DB first. Dashboard is just SQL queries on top.
- **Reading replies emotionally instead of analytically.** Cold reply hurts. One yes feels like winning. Track NUMBERS not VIBES — that's why the metric tiers exist.

## Definition of done

After 4 weeks of campaign:

- 500-1000 emails sent
- 100+ waitlist signups
- 15+ discovery calls completed  
- Tier 1/2/3 metrics computed and reviewed
- Clear go/no-go decision with data backing
- Top 3 features by vote count identified
- Median willingness-to-pay confirmed
- 5+ verbal beta commitments (if go-decision)

That decision THEN drives whether you sprint into product skills 01-12 or pivot.
