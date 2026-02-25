import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'

const MODEL_TAG = 'haiku'

function buildCanonical(texts: string[]): string {
  const unique = [...new Set(texts.map(t => t.trim()).filter(Boolean))].sort()
  return unique.join('\n---\n')
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // 1. Load deal + notes
  const { data: deal, error: dealErr } = await admin
    .from('deals')
    .select('deal_name, deal_notes')
    .eq('id', id)
    .single()
  if (dealErr || !deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  const { data: notes } = await admin
    .from('notes')
    .select('note_text')
    .eq('entity_type', 'deal')
    .eq('entity_id', id)
    .order('created_at', { ascending: true })
  const notesTexts = [
    ...(deal.deal_notes ? [deal.deal_notes] : []),
    ...(notes ?? []).map((n: { note_text: string }) => n.note_text),
  ]
  const canonical = buildCanonical(notesTexts)
  if (!canonical) return NextResponse.json({ error: 'No notes to summarize' }, { status: 400 })

  const notesHash = sha256Hex(canonical)

  // 2. Cache check
  const { data: cached } = await admin
    .from('deal_summary_cache')
    .select('summary')
    .eq('deal_id', id)
    .eq('notes_hash', notesHash)
    .eq('model', MODEL_TAG)
    .maybeSingle()
  if (cached?.summary) return NextResponse.json({ summary: cached.summary, cached: true })

  // 3. Call edge function
  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/summarize-notes`
  const edgeRes = await fetch(edgeFnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      deals: [{
        deal_id:         id,
        notes_hash:      notesHash,
        notes_canonical: canonical,
        dealName:        deal.deal_name,
      }],
    }),
  })

  if (!edgeRes.ok) {
    const txt = await edgeRes.text()
    return NextResponse.json({ error: `Edge function error: ${txt}` }, { status: 502 })
  }

  const { summaries } = await edgeRes.json() as {
    summaries: { deal_id: string; summary: string }[]
  }
  const summary = summaries?.[0]?.summary ?? ''
  if (!summary) return NextResponse.json({ error: 'No summary returned' }, { status: 502 })

  // 4. Cache result
  await admin.from('deal_summary_cache').upsert(
    { deal_id: id, notes_hash: notesHash, model: MODEL_TAG, summary },
    { onConflict: 'deal_id,notes_hash,model' }
  )

  return NextResponse.json({ summary, cached: false })
}
