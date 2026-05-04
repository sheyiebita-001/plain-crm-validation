# Plain CRM — Validation Campaign Project

This repo runs a closed-loop cold email validation campaign. Output: a data-backed
go/no-go decision on whether to build Plain CRM (working name).

## What this is

Sender domain `trysignalbench.com` (already bought, warmup since April 11 via 
Warmbox.ai). Cold emails go to ~500-1000 dissatisfied HubSpot users sourced 
via Apify scrapers. Recipients can reply, click, fill the survey, or unsubscribe.
Every event is captured automatically in Supabase via Smartlead webhooks. An 
admin dashboard at `trysignalbench.com/admin` shows live metrics against 
predefined go/no-go thresholds.

The product is NOT called Signal Bench — that's just the feedback site domain.
The product domain will be bought separately when validation says "go".

## Confirmed setup

- Sender: Sheyi A <sheyi@trysignalbench.com>
- Sending: Smartlead Basic ($39/mo) 
- Warmup: Warmbox.ai (continues parallel to Smartlead)
- Database: Supabase (free tier)
- Hosting: Vercel (free tier)
- Email tracking: Smartlead webhooks → Supabase
- Lead gen: Apify (existing account) + Apollo or Hunter free tier

## Key files

- `.claude/skills/00-validation-campaign/SKILL.md` — the full plan, READ FIRST
- `.claude/skills/base-context/SKILL.md` — code conventions for Next.js/Supabase
- `.claude/skills/launch-guide.md` — overall workflow and prompt library

## Stack (locked in)

- Next.js 14 App Router, TypeScript strict
- Supabase (auth + Postgres + storage)
- Drizzle ORM
- Tailwind + shadcn/ui  
- React Hook Form + Zod
- Resend for confirmation emails (uses trysignalbench.com)
- Smartlead for cold sending
- Vercel for hosting

## Decision criteria (Tier 1 / 2 / 3)

After 500-1000 emails sent over 3-4 weeks, hit the metrics in the SKILL.md to:
- BUILD IT: 2/3 tiers Strong, Tier 3 confirmed
- PROBABLY BUILD: All 3 tiers Healthy, 5+ verbal commitments
- PIVOT MESSAGE: Tier 1 Healthy, Tier 2 Concerning
- PIVOT AUDIENCE: Tier 1 Concerning
- DON'T BUILD: Tier 1 Healthy, Tier 3 Concerning

## Active phase

- [ ] Phase 1: Foundation (Supabase, Vercel, Smartlead accounts) ← START HERE
- [ ] Phase 2: Landing page + admin dashboard built (Claude Code)
- [ ] Phase 3: Lead generation (Apify + Apollo enrichment, ~500-1000 verified emails)
- [ ] Phase 4: Smartlead sequence configured + webhook tested
- [ ] Phase 5: Sending starts (30/day → 50/day after week 1)
- [ ] Phase 6: Daily reply triage (10 min/day)
- [ ] Phase 7: Weekly metrics review
- [ ] Phase 8: Go/no-go decision (end of week 4)

## Constraints

- Sheyi: solo founder, parent of three, 8-15 hours/week
- Direct communication, skip pleasantries
- B2B only, UK-based, PECR/GDPR compliant
- Cold sending domain (trysignalbench.com) is SEPARATE from future product domain
- Do not refer to "Signal Bench" as a product name — the from-name is just "Sheyi A"
- Email tone: lowercase, no jargon, no AI tells (no "delve", "leverage", "I hope this finds you well")

## Critical rules

- Every Supabase table has Row Level Security
- Admin dashboard is auth-gated to sheyi@trysignalbench.com only
- Unsubscribe propagation MUST work (DB → Smartlead API) within 60 seconds
- Suppression list is checked before any send (defence against re-imports)
- Webhook handler must be idempotent (Smartlead sometimes sends duplicate events)
- All secrets in .env.local, never committed
