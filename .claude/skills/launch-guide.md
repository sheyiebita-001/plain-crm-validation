# Launch Guide — Loading Plain CRM Into Claude Code

This guide takes you from zero to "Claude Code is building skill 01" in about 90 minutes. After that, building each skill takes a fresh session and the right prompts.

You'll work in two parallel tracks:

- **Track A (validation campaign)** — separate repo, runs weeks 0-4
- **Track B (product build)** — main repo, runs weeks 1-8

Set up Track A first (this guide section 1-2), let the campaign run while you build, then start Track B (section 3-4).

---

## 1. Prerequisites — accounts and tools

Set these up once. Most have free tiers.

### Track A (validation)

| Tool | Plan | Why | Action |
|---|---|---|---|
| Domain registrar | Pay-per-domain | Need 1 marketing domain + 2-3 cold sending domains | Buy via Cloudflare Registrar (cheapest, no markup) |
| Cloudflare | Free | DNS, anti-bot, Email Workers | Sign up |
| Vercel | Free | Landing page hosting | Sign up |
| Airtable | Free (1k records) | Waitlist + survey storage | Sign up |
| Resend | Free (3k/mo) | Confirmation emails | Sign up + verify domain |
| Instantly | Growth ($37/mo) | Cold email sending + warmup | Sign up |
| Apify | Free credit + paid | Lead scraping | You have this already |
| Apollo OR Hunter | Free tier | Email enrichment | Sign up |

### Track B (product)

| Tool | Plan | Why | Action |
|---|---|---|---|
| GitHub | Free | Code hosting | You have this |
| Vercel | Free | Product hosting | Same account as Track A |
| Supabase | Free | Auth + DB + Storage | Sign up |
| Stripe | Free until first payment | Payments | Sign up + complete identity verification |
| Sentry | Free (5k errors) | Error tracking | Sign up |
| Google Cloud Console | Free | OAuth client | Create project early — verification takes weeks |

### Local

```bash
node --version    # Need 20+
git --version
```

Install Claude Code if not already installed:
```bash
npm install -g @anthropic-ai/claude-code
```

---

## 2. Setting up Track A (validation campaign)

### 2.1 Create the validation repo

```bash
mkdir plain-crm-validation
cd plain-crm-validation
git init

# Drop the skills bundle in
unzip ~/Downloads/plain-crm-skills.zip
mkdir -p .claude
mv skills .claude/skills

# Move docs and guide to repo root
mv .claude/skills/launch-guide.md .
mkdir docs
```

### 2.2 Create CLAUDE.md (the project context file Claude Code reads automatically)

```bash
cat > CLAUDE.md << 'EOF'
# Plain CRM — Validation Campaign Project

This repo is the pre-launch validation campaign for Plain CRM (working name).

## What we're doing
Running cold email + landing page + survey to validate demand BEFORE building the product.
Output: 100+ waitlist emails, feature priorities, willingness-to-pay data, 15+ discovery calls.

## Key files
- `.claude/skills/00-validation-campaign/SKILL.md` — full campaign spec (READ THIS FIRST)
- `.claude/skills/base-context/SKILL.md` — code conventions

## Stack
- Next.js 14 App Router for landing page
- Airtable for waitlist storage
- Resend for confirmation emails
- Instantly for cold email sequences
- Apify for lead scraping
- Vercel for hosting

## Important: this is a SEPARATE repo from the product build.
Do not add product code here. Do not import product schemas. Keep marketing/validation
infrastructure decoupled from the product code.

## Active state
- [ ] Phase 1: Account setup
- [ ] Phase 2: Landing page deployed
- [ ] Phase 3: Lead generation running
- [ ] Phase 4: Cold email sequence configured
- [ ] Phase 5: Reply handling SOP set up
- [ ] Phase 6: Tracking dashboard live

Update this checkbox list as phases complete.
EOF
```

### 2.3 First Claude Code session for Track A

```bash
claude
```

Paste this prompt:

```
Read CLAUDE.md and .claude/skills/00-validation-campaign/SKILL.md in full.

Then read .claude/skills/base-context/SKILL.md for code conventions.

You are about to execute Phase 2 of the validation campaign skill: building the
landing page Next.js project at ./landing.

Before writing any code, review the landing page spec in the skill and report
back to me:
1. What you understand the goal to be
2. Three questions you have where the brief leaves you a choice (e.g. exact
   headline copy, color palette, founder photo)
3. Your proposed file structure

Wait for my answers before generating code.
```

This "report back, ask questions, wait" pattern is critical. It's faster than letting Claude Code run wild and then unwinding bad decisions.

### 2.4 After landing page is built

Continue Track A by setting up Instantly, Apify, and the cold email sequence. These are mostly manual (account setup) — Claude Code's role is to help you write copy variants and analyze responses.

---

## 3. Setting up Track B (product build)

### 3.1 Initialize the product repo

```bash
# In a different directory
cd ~/projects
npx create-next-app@latest plain-crm \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-eslint  # we'll add it back configured

cd plain-crm

# Install core dependencies
npm install @supabase/supabase-js @supabase/ssr drizzle-orm postgres zod react-hook-form @hookform/resolvers
npm install -D drizzle-kit @types/node

# Install shadcn/ui
npx shadcn@latest init

# Install dnd-kit for kanban (skill 04)
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

# Drop in the skills bundle
unzip ~/Downloads/plain-crm-skills.zip
mkdir -p .claude
mv skills .claude/skills

# Drop the spec
mkdir -p docs
cp ~/Downloads/plain-crm-mvp-spec.md docs/

git init
git add .
git commit -m "Initial Next.js scaffold + skills + spec"
```

### 3.2 Create the product CLAUDE.md

```bash
cat > CLAUDE.md << 'EOF'
# Plain CRM — Product Build

Multi-tenant CRM for solopreneurs/coaches/consultants. Flat-priced (£197 + £19/mo).
Working name: "Plain CRM" — replace before launch.

## ALWAYS read first when starting a session
1. `.claude/skills/base-context/SKILL.md` — non-negotiable code conventions
2. The current active skill's SKILL.md (see "Active skill" below)

## Reference docs
- `docs/plain-crm-mvp-spec.md` — full MVP specification

## Stack
Next.js 14 App Router, TypeScript strict, Supabase (Auth + Postgres + Storage),
Drizzle ORM, Tailwind, shadcn/ui, Zod, React Hook Form, Resend, Stripe.

## Build state
- [ ] Skill 01: auth-setup
- [ ] Skill 02: contacts-module
- [ ] Skill 03: companies-module
- [ ] Skill 04: deals-pipeline
- [ ] Skill 05: email-send (submit Google verification day 1)
- [ ] Skill 06: templates-module
- [ ] Skill 07: inbound-email-parser
- [ ] Skill 08: scheduler-module
- [ ] Skill 09: forms-module
- [ ] Skill 10: tasks-module
- [ ] Skill 11: hubspot-migrator
- [ ] Skill 12: dashboard-module

## Active skill
Currently working on: 01-auth-setup

## Critical rules (do not violate)
- Every business table has workspace_id, RLS policy in same migration
- Every query filters by workspace_id even though RLS catches it (defence in depth)
- Server actions for mutations, not API routes (except webhooks)
- All OAuth tokens encrypted at rest with AES-256-GCM
- No `any` types
- No client-side secrets
EOF
```

### 3.3 Set up environment variables

```bash
cat > .env.local << 'EOF'
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Encryption (for OAuth tokens — generate with: openssl rand -hex 32)
ENCRYPTION_KEY=

# Resend
RESEND_API_KEY=

# Google OAuth (skill 05)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/oauth/google/callback

# HubSpot OAuth (skill 11)
HUBSPOT_CLIENT_ID=
HUBSPOT_CLIENT_SECRET=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Cron secret (for Vercel Cron)
CRON_SECRET=

# Cloudflare Turnstile (skill 09)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
EOF

echo ".env.local" >> .gitignore
```

Generate encryption key now:
```bash
openssl rand -hex 32
# Paste output as ENCRYPTION_KEY in .env.local
```

### 3.4 Connect to GitHub and Vercel

```bash
# Create GitHub repo (use gh CLI or web UI)
gh repo create plain-crm --private --source=. --remote=origin --push

# Vercel: link via CLI
npx vercel link
npx vercel env pull .env.local  # if you've added env vars in Vercel
```

### 3.5 Run skill 01 — first product session

```bash
claude
```

Paste:

```
Read CLAUDE.md, then read .claude/skills/base-context/SKILL.md and 
.claude/skills/01-auth-setup/SKILL.md in full.

You will execute skill 01 (auth-setup) in this session. Before writing code:

1. Confirm you understand the goal in 2-3 sentences
2. List the files you will create
3. Tell me which decisions need my input (e.g. brand color choices,
   exact onboarding checklist text, email template wording)
4. STOP and wait for my answers

Do not write code or run any commands until I confirm.
```

After you answer the questions, prompt:

```
Confirmed. Execute the skill end-to-end.

Constraints:
- Stop before any decision not specified in the brief or my answers above
- After implementation, run the test plan in the SKILL.md
- Update CLAUDE.md to mark skill 01 complete
- Report what was built and any deviations from the brief
```

---

## 4. Prompt library — for every situation

Save these somewhere accessible. Use the closest match.

### 4.1 Starting a new skill

```
Update CLAUDE.md: previous skill complete, active skill is now N.

Read CLAUDE.md, then read .claude/skills/base-context/SKILL.md and
.claude/skills/<NN>-<name>/SKILL.md in full.

Before writing code:
1. Confirm goal in your own words
2. List dependencies on previously-built skills (which tables/components from
   earlier skills will you read or modify?)
3. Identify decisions needing my input
4. List files you'll create
5. Stop and wait for my answers
```

### 4.2 Implementing after design approval

```
Approved. Execute the skill end-to-end with these constraints:

- Match the conventions in base-context exactly (workspace_id, RLS, server actions, Zod)
- For UI, use shadcn/ui components - install any missing ones via `npx shadcn@latest add <name>`
- Run typecheck after each file: `npx tsc --noEmit`
- Run the test plan from the SKILL.md before declaring done
- If you hit ambiguity not covered in the brief, STOP and ask rather than guess

Stop and report after every 3 files so I can review.
```

### 4.3 Reviewing what was built

```
Review the implementation of skill <N> against its acceptance criteria.

For each checkbox item in the SKILL.md acceptance criteria, report:
- Met / partial / missing
- Evidence (file path or test output)

For "All meta acceptance criteria from base-context", verify each rule individually.

End with a punch list of what still needs to ship before we move to skill <N+1>.
```

### 4.4 Bug fix or error

```
I'm seeing this error: [paste error or describe issue]

Context:
- Active skill: <N>
- File where error occurred: <path>
- What I was trying to do: <action>

Read CLAUDE.md, the active skill, and any directly relevant files.
Form a hypothesis, propose a minimal fix, ask before applying.
```

### 4.5 Stuck mid-skill

```
I'm stuck on skill <N>. The brief specifies <X> but reality is <Y>.

Read the relevant section of the SKILL.md and the current code state.
Walk me through 2-3 options with tradeoffs. Recommend one.

Do not modify code in this turn — just analysis.
```

### 4.6 "I don't understand what this code does"

```
Explain the file at <path> as if I haven't seen it before.

Cover:
1. What is its responsibility (one sentence)
2. What functions/components does it export and what do they do
3. What does it depend on (imports)
4. What depends on it (search the codebase)
5. Where does multi-tenant safety enter (workspace_id usage)
```

### 4.7 Refactoring an earlier skill

```
We're now in skill <N>, but the implementation of skill <M> needs adjustment
because <reason>.

Before changing skill M's code:
1. Identify all callers of the affected interface (search the codebase)
2. Propose a refactor that minimizes blast radius
3. List which acceptance criteria of skill M might be affected
4. Ask before executing
```

### 4.8 Pre-deploy check

```
We're about to push to production for the first time.

Run a pre-deploy audit:
1. Search for hardcoded secrets (`grep` for common patterns)
2. Check no `console.log` left in production code
3. Confirm all migrations have RLS policies
4. List all routes and confirm auth protection: public vs (auth) vs (app)
5. List all server actions and confirm each calls getCurrentWorkspace
6. Confirm no `any` types remain
7. Run `npm run build` and report any warnings

Report findings. Don't fix yet.
```

### 4.9 Two skills in one session (only do this for short skills)

```
Read CLAUDE.md, base-context, and BOTH skills <NN1>-<name1> and <NN2>-<name2>.

Note dependencies between them: skill 2 may depend on skill 1.

Plan execution: skill 1 fully, then test, then skill 2.

Before starting skill 1: list decisions needing my input across BOTH skills.
Get all decisions in one batch so we don't context-switch.

Stop and wait for answers.
```

### 4.10 Validation campaign session (Track A)

```
Read CLAUDE.md and .claude/skills/00-validation-campaign/SKILL.md.

I'm working on Phase <N>: <phase name>.

Specifically I need help with:
[describe sub-task — e.g. "writing the cold email sequence variants",
"setting up the Airtable schema for waitlist storage", "draft the Apify
configuration for Trustpilot scraping"]

Walk me through it step by step. Output anything I'd paste/copy into
the relevant tool (Airtable schema spec, Apify input JSON, email copy, etc.).
```

### 4.11 Daily standup with Claude Code

At the start of every session — even if you're continuing yesterday's work:

```
Read CLAUDE.md.

Status check:
1. What's the active skill?
2. What was completed in the last session (check git log: `git log --oneline -10`)
3. What's the next task per the SKILL.md?
4. Any open todos or known issues?

Brief me, then wait for instructions.
```

This costs little and prevents the agent from drifting from prior context.

---

## 5. Workflow patterns

### 5.1 The skill-per-session pattern

One skill per Claude Code session. When the skill is done:

```bash
git add .
git commit -m "feat: skill 0X complete - <skill name>"
git push

# Close terminal, take a break, come back fresh
claude
```

Why: Claude Code's context fills up. Starting fresh with the just-updated CLAUDE.md is cleaner than letting context decay.

### 5.2 The PR-style review pattern

Even though you're solo, treat each skill like a PR:

1. Skill executes → all changes uncommitted
2. You run: `git diff` to see all changes
3. Run the SKILL.md's test plan manually
4. If happy: commit. If not: prompt 4.3 (review) and 4.4 (bug fix)
5. Push to GitHub
6. Vercel auto-deploys to preview
7. Smoke test on preview URL
8. Merge to main → production

### 5.3 The 3-question budget

When Claude Code asks for clarification, you have a budget of 3 round trips per skill before stopping to think.

If you're on round 4: there's something wrong with the brief or the request. Stop, write down what's actually needed, update the SKILL.md before continuing.

### 5.4 The "real user input" rule

Never make a feature decision based purely on intuition past skill 04 (the demo milestone). After week 4, every decision should reference one of:

- A specific reply from a discovery call (Phase 5 of skill 00)
- A vote count from the survey (Phase 5 of skill 00)
- A measurable problem in your own usage of the product (you should be a daily user from week 5 onwards — eat your own dog food)

If you can't cite one of these, the decision is a guess. Either find data or skip the decision.

---

## 6. Common Claude Code gotchas

### 6.1 Claude Code wants to install a different library

It will sometimes suggest adding a library not in the stack (e.g. tRPC, Prisma, NextAuth). Default answer: NO. The stack in base-context is opinionated for a reason. Override only if you have a specific reason.

### 6.2 It generates a lot of code

If a skill produces 30+ files in one shot, that's too much. Better workflow:

```
Pause. Output only the database schema and migration first.
After I review and confirm, generate the server actions.
After I review, generate the UI.
```

### 6.3 It "fixes" things you didn't ask about

Sometimes Claude Code will refactor unrelated files because it noticed something. Catch this in `git diff`. If the change isn't in the SKILL.md scope: revert it.

```
You modified <file> outside the skill scope. Revert that change unless you can
cite which acceptance criterion required it.
```

### 6.4 It hallucinates an API

For HubSpot, Gmail, Stripe — the SKILL.md has the correct endpoints. If Claude Code generates code calling a different endpoint, check it against official docs before running.

### 6.5 It silently disables type checks

Watch for `// @ts-expect-error`, `// eslint-disable`, or `as any`. These are permitted in tests, but never in production code without an explanation comment.

---

## 7. Emergency commands

### Reset to last working state
```bash
git stash             # Save current changes
git checkout main     # Back to known good
# Reconsider, then: git stash pop OR git stash drop
```

### Wipe and re-run a skill from scratch
```bash
git checkout main           # Last good state
git reset --hard origin/main
# Then re-run the skill from scratch with fresh prompts
```

### Database is in a weird state
```bash
# In Supabase dashboard: SQL Editor
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
# Then re-run all migrations: npm run db:migrate
```

### "It's all broken and I don't know why"
```
Read CLAUDE.md and the last 3 git commits (`git log -p -3`).

Investigate the current broken state. Don't fix — just diagnose and report:
- What is broken (specifically, with evidence)
- When it broke (which commit introduced the regression)
- Hypothesis for why
- Three options to recover, with risk assessment

Wait for my decision before any change.
```

---

## 8. Done checklist

You've finished setup when:

- [ ] Both repos exist on GitHub with skills bundle inside
- [ ] CLAUDE.md exists in both repos with active state
- [ ] Both projects deploy to Vercel (even if they're just hello-world right now)
- [ ] All accounts in section 1 are signed up
- [ ] You've opened Claude Code in each repo and confirmed it can read CLAUDE.md
- [ ] You've executed at least one prompt from the library successfully

You're ready to run skill 00 (validation) and skill 01 (auth-setup) in parallel.

Good luck. Ship.
