# Plain CRM — Claude Code Subagent Skills

This directory contains scoped subagent briefs for building Plain CRM via Claude Code in agentic mode. Each skill is a self-contained instruction set that Claude Code can execute and ship.

## How to use

1. **Drop this entire `skills/` directory into your project root** (or `.claude/skills/` if you prefer Claude Code's convention).
2. **Always read `base-context/SKILL.md` first.** Every other skill assumes its rules.
3. **Execute in numerical order.** Skills are numbered 00-12 to match the build sequence. Out-of-order execution will create dependency gaps.
4. **One skill at a time.** Don't ask Claude Code to "build the whole app". Run each skill, review the diff, ship, then move on.
5. **See `launch-guide.md` (next to this README in the bundle) for step-by-step setup and prompt templates.**

## Recommended order

```
Week 0:  Run skill 00 (validation campaign) - separate repo
Week 1:  Skill 01 (auth foundation)
Week 2:  Skills 02 + 03 (contacts and companies)
Week 3:  Skill 04 (deals pipeline) → DEMO MILESTONE
Week 5:  Skills 05 + 06 (email send + templates) — submit Google verification day 1
Week 6:  Skills 07 + 10 (inbound parser + tasks)
Week 7:  Skills 08 + 09 + 11 (scheduler + forms + HubSpot migrator)
Week 8:  Skill 12 (dashboard) + Stripe + launch prep
```

Skill 00 runs in parallel with the build — feedback from the campaign should refine what you actually ship.

## Project conventions

These are repeated in `base-context/SKILL.md` for the agent. Listed here for your reference:

- **Stack:** Next.js 14 App Router, TypeScript strict, Supabase (Auth + Postgres + Storage), Drizzle ORM, Tailwind, shadcn/ui, Zod, React Hook Form
- **Multi-tenant:** every row has `workspace_id`. RLS policies enforce isolation. Every query filters by workspace_id even though RLS would catch a miss — defence in depth.
- **Server actions** for all mutations, not API routes. API routes only for webhooks and public endpoints.
- **Validation:** Zod schemas at every boundary.
- **No client-side secrets.** All API keys and OAuth tokens stay server-side.
- **Migrations:** Drizzle generates SQL. Every schema change ships with a migration file.

## Skill index

| # | Skill | Builds | Difficulty |
|---|---|---|---|
| 00 | validation-campaign | Pre-launch landing page, Apify lead gen, Instantly cold email, waitlist | 3/5 |
| -- | base-context | Project rules, conventions, stack | n/a |
| 01 | auth-setup | Signup, login, workspace creation, RLS foundations | 2/5 |
| 02 | contacts-module | Contacts CRUD, list/search/filter, detail page | 3/5 |
| 03 | companies-module | Companies CRUD, auto-link via email domain | 2/5 |
| 04 | deals-pipeline | Kanban board, pipelines, stages, deal detail | 3/5 |
| 05 | email-send | Gmail OAuth, send via user's Gmail, open/click tracking | 3/5 |
| 06 | templates-module | Email templates with variables | 2/5 |
| 07 | inbound-email-parser | BCC dropbox, Resend inbound webhook, contact matching | 4/5 |
| 08 | scheduler-module | Public booking page, availability engine, calendar invites | 4/5 |
| 09 | forms-module | Form builder, embed widget, anti-spam | 3/5 |
| 10 | tasks-module | Tasks CRUD, dashboard widget, reminder cron | 1/5 |
| 11 | hubspot-migrator | One-click HubSpot import via async export API | 4/5 |
| 12 | dashboard-module | Home dashboard with fixed widgets | 2/5 |

## When to deviate

These skills are starting points, not contracts. Things that will and should change:

- Database schema — refine as edge cases surface during builds
- UI patterns — when shadcn ships a new component that's better, use it
- Test plan — expand once real users find the bugs you didn't predict

The skills assume the build sequence above. If your sequence changes, re-order accordingly.

## When to ignore these skills

- If a skill conflicts with current best practice in a library you're using, follow the library
- If a skill prescribes architecture that doesn't fit your real schema by week 4, adapt
- If you ship a feature differently than the skill specs and it works, ship it. Update the skill afterwards.
