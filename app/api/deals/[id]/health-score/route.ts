import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeDealHealthScore } from '@/lib/deal-health-score'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Verify caller is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // 1. Load the deal with stage info
  const { data: deal, error: dealErr } = await admin
    .from('deals')
    .select('*, deal_stages(stage_name, win_probability)')
    .eq('id', id)
    .single()
  if (dealErr || !deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  // 2. ACV distribution across all deals (non-zero)
  const { data: allDeals } = await admin
    .from('deals')
    .select('value_amount')
    .not('value_amount', 'is', null)
    .gt('value_amount', 0)
  const acvDistribution: number[] = (allDeals ?? [])
    .map((d: { value_amount: number }) => Number(d.value_amount))
    .filter((v: number) => v > 0)
    .sort((a: number, b: number) => a - b)

  // 3. Load activity notes for this deal (for recency + signal)
  const { data: notes } = await admin
    .from('notes')
    .select('note_text, created_at')
    .eq('entity_type', 'deal')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
  const notesList = notes ?? []
  const latestNoteAt = notesList[0]?.created_at ?? null
  const allNotesText = notesList.map((n: { note_text: string }) => n.note_text).join(' ')

  // 4. Compute score
  const stage = deal.deal_stages as { stage_name: string; win_probability: number | null } | null
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
    acvDistribution
  )

  // 5. Persist
  const { error: updateErr } = await admin
    .from('deals')
    .update({
      health_score:         result.score,
      hs_stage_probability: result.components.stageProbability,
      hs_velocity:          result.components.velocity,
      hs_activity_recency:  result.components.activityRecency,
      hs_close_date:        result.components.closeDateIntegrity,
      hs_acv:               result.components.acv,
      hs_notes_signal:      result.components.notesSignal,
      health_debug:         result.debug,
    })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ score: result.score, components: result.components })
}
