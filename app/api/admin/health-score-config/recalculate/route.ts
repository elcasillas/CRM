import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeDealHealthScore, ScoringConfig } from '@/lib/deal-health-score'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return profile?.role === 'admin' ? user : null
}

// POST /api/admin/health-score-config/recalculate
export async function POST() {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // Load config
  const { data: configRow } = await admin
    .from('health_score_config')
    .select('weights, keywords')
    .limit(1)
    .single()
  const config = (configRow ?? undefined) as ScoringConfig | undefined

  // Load all deals with stage info
  const { data: deals, error: dealsErr } = await admin
    .from('deals')
    .select('id, value_amount, close_date, last_activity_at, deal_notes, deal_stages(stage_name, win_probability)')
  if (dealsErr || !deals) return NextResponse.json({ error: 'Failed to load deals' }, { status: 500 })

  // ACV distribution
  const acvDistribution = deals
    .map(d => d.value_amount ? Number(d.value_amount) : 0)
    .filter(v => v > 0)
    .sort((a, b) => a - b)

  // Load all deal notes in one query
  const { data: allNotes } = await admin
    .from('notes')
    .select('entity_id, note_text, created_at')
    .eq('entity_type', 'deal')
    .order('created_at', { ascending: false })
  const notesByDeal = new Map<string, { note_text: string; created_at: string }[]>()
  for (const n of allNotes ?? []) {
    const arr = notesByDeal.get(n.entity_id) ?? []
    arr.push(n)
    notesByDeal.set(n.entity_id, arr)
  }

  // Compute and collect updates
  const updates: {
    id: string
    health_score: number
    hs_stage_probability: number
    hs_velocity: number
    hs_activity_recency: number
    hs_close_date: number
    hs_acv: number
    hs_notes_signal: number
    health_debug: Record<string, unknown>
  }[] = []

  for (const deal of deals) {
    const notes = notesByDeal.get(deal.id) ?? []
    const latestNoteAt = notes[0]?.created_at ?? null
    const allNotesText = notes.map(n => n.note_text).join(' ')
    const stageRaw = deal.deal_stages
    const stage = (Array.isArray(stageRaw) ? stageRaw[0] : stageRaw) as { stage_name: string; win_probability: number | null } | null

    const result = computeDealHealthScore(
      {
        win_probability:  stage?.win_probability ?? null,
        stage_name:       stage?.stage_name ?? null,
        value_amount:     deal.value_amount ? Number(deal.value_amount) : null,
        close_date:       deal.close_date ?? null,
        last_activity_at: deal.last_activity_at ?? null,
        deal_notes:       deal.deal_notes ?? null,
        latestNoteAt,
        allNotesText,
      },
      acvDistribution,
      config
    )

    updates.push({
      id:                   deal.id,
      health_score:         result.score,
      hs_stage_probability: result.components.stageProbability,
      hs_velocity:          result.components.velocity,
      hs_activity_recency:  result.components.activityRecency,
      hs_close_date:        result.components.closeDateIntegrity,
      hs_acv:               result.components.acv,
      hs_notes_signal:      result.components.notesSignal,
      health_debug:         result.debug,
    })
  }

  // Upsert all at once
  const { error: upsertErr } = await admin.from('deals').upsert(updates, { onConflict: 'id' })
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ updated: updates.length })
}
