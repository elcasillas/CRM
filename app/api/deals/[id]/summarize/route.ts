import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'

const MODEL_TAG = 'haiku-s1'

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
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content: `You are an expert CRM analyst summarizing deal notes for a sales team.

You must always produce a summary with exactly four sections, in this order, using these exact headings:

## Current Status and Client Intent
## Key Activities and Communications
## Current Blockers
## Timeline and Next Steps

Rules:
- Include all four sections every time, in the order listed above. Do not rename, skip, or reorder them.
- Write each section as one or two complete, professional sentences. Do not use bullet points or lists.
- If the notes contain no relevant information for a section, write a single neutral sentence such as "No blockers have been identified at this time." or "No specific timeline or next steps are noted."
- Be specific — include names, dates, and action items where the notes mention them.
- Remove duplicate or repeated information while preserving the underlying facts.
- Do not invent or infer facts beyond what the notes contain.
- Keep the tone professional and concise — suitable for a quick cross-deal review.`,
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

// ── GET — return stored summary from deals table ─────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('deals')
    .select('ai_summary, ai_summary_generated_at')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  return NextResponse.json({
    summary: data.ai_summary ?? null,
    generatedAt: data.ai_summary_generated_at ?? null,
  })
}

// ── POST — generate (or return cached) summary, persist to deals ─────────────

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

  let summary: string
  let isNew = false

  if (cached?.summary) {
    summary = cached.summary
  } else {
    // 3. Call OpenRouter
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
    isNew = true
  }

  // 5. Persist to deals table
  //    Always update ai_summary; only update generated_at when actually running AI
  //    (or when no timestamp exists yet)
  const now = new Date().toISOString()
  const updatePayload: Record<string, string> = { ai_summary: summary }
  if (isNew) {
    updatePayload.ai_summary_generated_at = now
  } else {
    // On cache hit, set generated_at only if it's not yet recorded
    const { data: existing } = await admin
      .from('deals')
      .select('ai_summary_generated_at')
      .eq('id', id)
      .single()
    if (!existing?.ai_summary_generated_at) {
      updatePayload.ai_summary_generated_at = now
    }
  }

  await admin.from('deals').update(updatePayload).eq('id', id)

  // Fetch the final generated_at to return to the client
  const { data: finalDeal } = await admin
    .from('deals')
    .select('ai_summary_generated_at')
    .eq('id', id)
    .single()

  return NextResponse.json({
    summary,
    cached: !isNew,
    generatedAt: finalDeal?.ai_summary_generated_at ?? now,
  })
}
