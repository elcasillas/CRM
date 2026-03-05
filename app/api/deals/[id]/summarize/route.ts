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

async function callOpenRouter(canonical: string, dealName: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured')
  const model = (process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4-5').trim()

  const noteLines = canonical
    .split('\n---\n')
    .map(n => `- ${n.trim()}`)
    .join('\n')

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://crm-six-roan.vercel.app',
      'X-Title': 'CRM Deal Summarizer',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: 'You are summarizing CRM deal notes for a sales dashboard. Write a 3-5 sentence summary covering: (1) current status and stage, (2) key activities and interactions, (3) blockers or risks, and (4) next steps and expected timeline. Be factual and specific—include names, dates, and action items where available. Respond with plain text only.',
        },
        {
          role: 'user',
          content: `Deal: "${dealName}"\nNotes:\n${noteLines}`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenRouter error ${res.status}: ${txt}`)
  }

  const json = await res.json()
  return (json.choices?.[0]?.message?.content ?? '').trim()
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
    .select('deal_name')
    .eq('id', id)
    .single()
  if (dealErr || !deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  const { data: notes } = await admin
    .from('notes')
    .select('note_text')
    .eq('entity_type', 'deal')
    .eq('entity_id', id)
    .order('created_at', { ascending: true })
  const notesTexts = (notes ?? []).map((n: { note_text: string }) => n.note_text)
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

  // 3. Call OpenRouter
  let summary: string
  try {
    summary = await callOpenRouter(canonical, deal.deal_name)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
  if (!summary) return NextResponse.json({ error: 'No summary returned' }, { status: 502 })

  // 4. Cache result
  await admin.from('deal_summary_cache').upsert(
    { deal_id: id, notes_hash: notesHash, model: MODEL_TAG, summary },
    { onConflict: 'deal_id,notes_hash,model' }
  )

  return NextResponse.json({ summary, cached: false })
}
