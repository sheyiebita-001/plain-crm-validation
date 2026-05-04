# SKILL: 04-deals-pipeline

**Inherits:** `base-context/SKILL.md`
**Depends on:** `02-contacts-module`, `03-companies-module`
**Build difficulty:** 3/5
**Estimated time:** 2-3 sessions

## Goal

Build the deals module with visual kanban pipeline, custom stages, and deal detail pages. This is a core "I want to use this product" moment — the kanban needs to feel responsive and clean.

## Acceptance criteria

- [ ] Pipelines table with workspace_id and RLS
- [ ] Stages table linked to pipelines
- [ ] Deals table with workspace_id, contact_id, company_id, pipeline_id, stage_id
- [ ] Default pipeline auto-created with stages: Lead → Qualified → Proposal → Negotiation → Won → Lost
- [ ] Kanban board at `/deals` with drag-and-drop between stages
- [ ] Drag updates `stage_id` AND writes an activity row recording the change
- [ ] Stage column shows: stage name, deal count, sum of deal amounts
- [ ] Deal card shows: name, contact name + avatar, amount, expected close date (relative), last activity icon
- [ ] Click deal card → detail modal or page (your choice; modal is faster to build)
- [ ] Create deal: from sidebar, from contact page, from company page
- [ ] Pipeline editor at `/settings/pipelines` with: rename pipeline, add/remove/reorder stages, set probability per stage
- [ ] Multiple pipelines supported (e.g. "New Business", "Renewals")
- [ ] All meta acceptance criteria

## Files to create

```
src/db/schema/pipelines.ts
src/db/schema/deals.ts
src/db/migrations/0004_pipelines_deals.sql

src/app/(app)/deals/page.tsx                       (kanban)
src/app/(app)/deals/[id]/page.tsx                  (detail; or modal-based)
src/app/(app)/settings/pipelines/page.tsx
src/app/(app)/settings/pipelines/[id]/page.tsx

src/server/actions/deals.ts
src/server/actions/pipelines.ts
src/server/queries/deals.ts

src/components/deals/kanban-board.tsx
src/components/deals/kanban-column.tsx
src/components/deals/deal-card.tsx
src/components/deals/deal-form.tsx
src/components/deals/deal-detail-panel.tsx
src/components/pipelines/pipeline-editor.tsx
src/components/pipelines/stage-row.tsx

src/lib/deals/schemas.ts
```

## Database schema

```typescript
export const pipelines = pgTable('pipelines', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const stages = pgTable('stages', {
  id: uuid('id').defaultRandom().primaryKey(),
  pipelineId: uuid('pipeline_id').notNull().references(() => pipelines.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  probability: integer('probability').notNull().default(0), // 0-100
  isWon: boolean('is_won').notNull().default(false),
  isLost: boolean('is_lost').notNull().default(false),
})

export const deals = pgTable('deals', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  name: text('name').notNull(),
  
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
  
  pipelineId: uuid('pipeline_id').notNull().references(() => pipelines.id),
  stageId: uuid('stage_id').notNull().references(() => stages.id),
  
  amount: decimal('amount', { precision: 12, scale: 2 }),
  currency: text('currency').notNull().default('GBP'),
  
  expectedCloseDate: date('expected_close_date'),
  actualCloseDate: date('actual_close_date'),
  
  ownerId: uuid('owner_id'),
  
  customFields: jsonb('custom_fields').notNull().default({}),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  workspaceIdx: index('deals_workspace_idx').on(table.workspaceId),
  pipelineStageIdx: index('deals_pipeline_stage_idx').on(table.pipelineId, table.stageId),
}))
```

## Default pipeline seeding

In the workspace creation logic from skill 01, after the workspace row is created:

```typescript
const [pipeline] = await db.insert(pipelines).values({
  workspaceId: workspace.id,
  name: 'Sales Pipeline',
  isDefault: true,
}).returning()

await db.insert(stages).values([
  { pipelineId: pipeline.id, name: 'Lead', position: 1, probability: 10 },
  { pipelineId: pipeline.id, name: 'Qualified', position: 2, probability: 30 },
  { pipelineId: pipeline.id, name: 'Proposal', position: 3, probability: 50 },
  { pipelineId: pipeline.id, name: 'Negotiation', position: 4, probability: 75 },
  { pipelineId: pipeline.id, name: 'Won', position: 5, probability: 100, isWon: true },
  { pipelineId: pipeline.id, name: 'Lost', position: 6, probability: 0, isLost: true },
])
```

Add this to skill 01's workspace creation. Update the auth-setup migration if needed.

## Drag and drop

Use `@dnd-kit/core` and `@dnd-kit/sortable`. It's accessible, lightweight, and supports keyboard.

```typescript
// Pseudocode
function KanbanBoard({ pipeline, stages, deals }) {
  const handleDragEnd = async (event) => {
    const dealId = event.active.id
    const newStageId = event.over.id
    
    // Optimistic update
    setDeals(prev => prev.map(d => 
      d.id === dealId ? { ...d, stageId: newStageId } : d
    ))
    
    // Server update
    await moveDealToStage(dealId, newStageId)
  }
  
  return (
    <DndContext onDragEnd={handleDragEnd}>
      {stages.map(stage => (
        <KanbanColumn 
          key={stage.id} 
          stage={stage}
          deals={deals.filter(d => d.stageId === stage.id)}
        />
      ))}
    </DndContext>
  )
}
```

## Server action: moveDealToStage

```typescript
export async function moveDealToStage(dealId: string, stageId: string) {
  const workspace = await getCurrentWorkspace()
  
  // Verify both deal and stage belong to workspace
  const [deal, stage] = await Promise.all([
    db.query.deals.findFirst({ where: and(eq(deals.id, dealId), eq(deals.workspaceId, workspace.id)) }),
    // ... stage check via pipeline ownership
  ])
  if (!deal || !stage) throw new Error('Not found')
  
  const oldStageId = deal.stageId
  
  await db.transaction(async (tx) => {
    // Update deal
    await tx.update(deals).set({ 
      stageId, 
      updatedAt: new Date(),
      // If moving to won/lost stage, set actual_close_date
      ...(stage.isWon || stage.isLost ? { actualCloseDate: new Date() } : {})
    }).where(eq(deals.id, dealId))
    
    // Log activity
    await tx.insert(activities).values({
      workspaceId: workspace.id,
      type: 'note',
      dealId,
      contactId: deal.contactId,
      body: `Stage changed: ${oldStage.name} → ${stage.name}`,
      metadata: { kind: 'stage_change', from: oldStageId, to: stageId },
    })
  })
  
  revalidatePath('/deals')
}
```

## UI requirements

### Kanban board
- Horizontal scroll on mobile, fixed grid on desktop
- Each column: header (name, count, total), scrollable card list, "+ Add deal" at bottom
- Cards: shadcn Card with subtle border, hover lift, drag handle on full card
- Empty stage: dashed border placeholder "Drag deals here or + Add"
- Pipeline switcher at top (if user has multiple)

### Deal card
```
┌─────────────────────────┐
│ Acme Co — Q1 Renewal    │  ← name (truncate)
│ Sarah Chen              │  ← contact
│ £12,500                 │  ← amount, formatted
│ Closes 12 Mar           │  ← expected close, "Overdue" red if past
│ 2 days ago              │  ← last activity
└─────────────────────────┘
```

### Deal detail
Two-column:
- Left: header (editable name, pipeline + stage dropdown), tabs (Activity, Tasks, Emails, Notes), large activity feed
- Right: properties (amount, close date, owner), associated contact card, associated company card, custom fields

### Pipeline editor
- List of pipelines (default badge)
- Click pipeline → stage editor
- Drag to reorder stages
- Inline rename
- Delete stage with confirmation (warns about deals in that stage; prompts you to move them)
- Add stage button at bottom

## Out of scope

- Probability-weighted forecast reports (Phase 2 reporting)
- Automated stage progression rules (Phase 2 workflows)
- Deal collaboration (multi-owner) — single user MVP
- Recurring deals / contracts
- Quotes & line items (Phase 2)

## Test plan

1. **Default pipeline created:** new workspace has Sales Pipeline with 6 stages
2. **Create deal:** form → deal appears in correct stage
3. **Drag and drop:** drag deal from Lead to Qualified → stage updates → activity logged
4. **Stage totals:** column header shows correct count and currency-formatted sum
5. **Won/Lost behavior:** moving to Won stage sets `actual_close_date`
6. **Multiple pipelines:** create second pipeline → switcher shows both → deals are isolated per pipeline
7. **Pipeline deletion:** can't delete pipeline with deals (or moves them to default first)
8. **Workspace isolation:** deals never visible across workspaces

## Common pitfalls

- **Optimistic updates can desync:** if the server fails, revert. Use `useOptimistic` from React or manage with toast errors.
- **Many deals performance:** kanban with 500+ deals per column will lag. Add virtualization (react-window) post-MVP. For MVP, cap at 200/column with "show more" button.
- **Stage probability use:** show forecast ("Weighted £" = sum of (amount × probability)) in column header subtitle, not just raw sum.
- **Don't allow dragging across pipelines.** That's a different kind of move requiring user confirmation.

## Definition of done

You can: create a deal, see it in the kanban, drag it through stages, see activities log every move, configure your own pipeline. With 50 deals across 6 stages, drag-and-drop feels instant.
