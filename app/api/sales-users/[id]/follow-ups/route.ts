import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertManagerOrAdmin } from '@/lib/api-helpers'
import { getOrGenerateDealFollowUp, isStageEligibleForFollowUp } from '@/lib/deal-followup'

// ── POST — follow-up content for every open deal of one salesperson ──────────
// Same generator as the single-deal Email and Template actions, run across the
// salesperson's open deals with bounded concurrency. Admins and sales managers
// only; the check is here rather than in the UI, so a crafted request from any
// other role is refused regardless of what the client renders.

/** Parallel AI calls in flight. Keeps a large book from bursting the provider. */
const CONCURRENCY = 3

/** Run `worker` over `items`, at most `limit` at a time, preserving order. */
async function mapWithLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await assertManagerOrAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Refresh forces regeneration of every deal, ignoring saved output
  const force = await req.json().then(b => b?.force === true).catch(() => false)

  const { id: ownerId } = await params
  const admin = createAdminClient()

  const { data: owner } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', ownerId)
    .maybeSingle()
  if (!owner) return NextResponse.json({ error: 'Salesperson not found' }, { status: 404 })

  const { data: dealRows, error: dealsErr } = await admin
    .from('deals')
    .select('id, deal_name, stage_id, deal_stages ( stage_name, is_closed )')
    .eq('deal_owner_id', ownerId)
  if (dealsErr) return NextResponse.json({ error: dealsErr.message }, { status: 502 })

  // Stage eligibility is settled first, on the deal's current stage, before any
  // saved content is read or any generation is considered. An excluded deal is
  // therefore never displayed, generated, regenerated or copied, whatever is
  // stored for it and whether or not this is a forced refresh.
  const openDeals = (dealRows ?? []).filter(d => {
    const stage = d.deal_stages as { stage_name: string; is_closed: boolean }[] | { stage_name: string; is_closed: boolean } | null
    const resolved = Array.isArray(stage) ? stage[0] : stage
    return isStageEligibleForFollowUp(resolved?.stage_name, resolved?.is_closed)
  })

  if (openDeals.length === 0) {
    return NextResponse.json({ ownerName: owner.full_name ?? 'Unknown', sections: [], generatedAt: new Date().toISOString() })
  }

  // One batched notes read for ordering, reused by the generator so no deal
  // repeats the lookup.
  const { data: noteRows } = await admin
    .from('notes')
    .select('entity_id, created_at')
    .eq('entity_type', 'deal')
    .in('entity_id', openDeals.map(d => d.id as string))
    .order('created_at', { ascending: false })

  const latestNote = new Map<string, string>()
  for (const n of noteRows ?? []) {
    if (!latestNote.has(n.entity_id as string)) latestNote.set(n.entity_id as string, n.created_at as string)
  }

  // Deals needing attention first: never noted, then longest untouched, then
  // by name so the order is stable between runs.
  const ordered = [...openDeals].sort((a, b) => {
    const aAt = latestNote.get(a.id as string)
    const bAt = latestNote.get(b.id as string)
    if (!aAt && bAt) return -1
    if (aAt && !bAt) return 1
    if (aAt && bAt && aAt !== bAt) return aAt < bAt ? -1 : 1
    return String(a.deal_name).localeCompare(String(b.deal_name))
  })

  const sections = await mapWithLimit(ordered, CONCURRENCY, async deal => {
    const dealId = deal.id as string
    const dealName = deal.deal_name as string
    try {
      const result = await getOrGenerateDealFollowUp(dealId, admin, {
        force,
        dealName,
        stageId: (deal.stage_id as string | null) ?? null,
        lastNoteStyle: 'suffixed',
        latestNoteAt: latestNote.get(dealId) ?? null,
      })
      return {
        dealId,
        dealName: result.dealName,
        lastNoteLine: result.lastNoteLine,
        items: result.items,
        body: result.body,
        generatedAt: result.generatedAt,
        fromCache: result.fromCache,
        error: null as string | null,
      }
    } catch (err) {
      // One deal failing must not lose the rest of the report
      return {
        dealId,
        dealName,
        lastNoteLine: '',
        items: '',
        body: '',
        generatedAt: null as string | null,
        fromCache: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  return NextResponse.json({
    ownerName: owner.full_name ?? 'Unknown',
    sections,
    generatedAt: new Date().toISOString(),
  })
}
