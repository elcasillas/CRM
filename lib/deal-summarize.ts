import { createHash } from 'crypto'
import { SOURCE_FRAMING_RULES, PLAIN_PUNCTUATION_RULES } from './ai-prompt-rules'
import { normalizeDashes } from './ai-sanitize'
import type { SupabaseClient } from '@supabase/supabase-js'

export const MODEL_TAG = 'haiku-s2'

export function buildCanonical(texts: string[]): string {
  const unique = [...new Set(texts.map(t => t.trim()).filter(Boolean))].sort()
  return unique.join('\n---\n')
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Remove hyphens, dashes and semicolons from a generated summary. The prompt
 * asks the model to avoid them; this guarantees it, so no summary can reach
 * the UI containing them. Rewrites rather than deletes wherever the character
 * carries meaning (dates, ranges, clause breaks).
 */
export function stripRestrictedPunctuation(text: string): string {
  if (!text) return text
  let out = text

  // ISO dates first, so they survive as readable text instead of losing digits
  out = out.replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (m, y, mo, d) => {
    const idx = Number(mo) - 1
    return idx >= 0 && idx < 12 ? `${MONTH_NAMES[idx]} ${Number(d)}, ${y}` : m
  })
  // Em and en dashes, via the shared sanitiser
  out = normalizeDashes(out)
  // Hyphen ranges, hyphen bullets, then compounds and leftovers
  out = out.replace(/(\d)\s*-\s*(\d)/g, '$1 to $2')
  out = out.replace(/^[ \t]*-+[ \t]+/gm, '')
  out = out.replace(/\s*;\s*/g, '. ')
  out = out.replace(/(\w)-+(\w)/g, '$1 $2')
  out = out.replace(/-/g, '')
  // Capitalise after the sentence breaks introduced above
  out = out.replace(/([.!?]\s+)([a-z])/g, (_m, p, c) => p + c.toUpperCase())
  // Tidy spacing left behind
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '')
  return out
}

export async function callSummarizeLLM(canonical: string, dealName: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured')
  const model = (process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4-5').trim()

  const noteLines = canonical
    .split('\n---\n')
    .map((n, i) => `${i + 1}. ${n.trim()}`)
    .join('\n')

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://crm.hostopia.com',
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
- Be specific. Include names, dates, and action items where the notes mention them.
- Remove duplicate or repeated information while preserving the underlying facts.
- Do not invent or infer facts beyond what the notes contain.
- Keep the tone professional and concise, suitable for a quick cross deal review.

${SOURCE_FRAMING_RULES}

${PLAIN_PUNCTUATION_RULES}`,
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
  const raw = (json.choices?.[0]?.message?.content ?? '').trim()
  return stripRestrictedPunctuation(raw)
}

export interface SummaryResult {
  summary: string
  isNew:   boolean
  generatedAt: string
}

export async function getOrCreateSummary(dealId: string, admin: SupabaseClient<any>): Promise<SummaryResult | null> {
  const { data: deal, error: dealErr } = await admin
    .from('deals')
    .select('deal_name')
    .eq('id', dealId)
    .single()
  if (dealErr || !deal) return null

  const { data: notes } = await admin
    .from('notes')
    .select('note_text')
    .eq('entity_type', 'deal')
    .eq('entity_id', dealId)
    .order('created_at', { ascending: true })
  const notesTexts = (notes ?? []).map((n: { note_text: string }) => n.note_text)
  const canonical = buildCanonical(notesTexts)
  if (!canonical) return null

  const notesHash = sha256Hex(canonical)

  const { data: cached } = await admin
    .from('deal_summary_cache')
    .select('summary')
    .eq('deal_id', dealId)
    .eq('notes_hash', notesHash)
    .eq('model', MODEL_TAG)
    .maybeSingle()

  let summary: string
  let isNew = false

  if (cached?.summary) {
    summary = cached.summary
  } else {
    summary = await callSummarizeLLM(canonical, deal.deal_name)
    if (!summary) return null

    await admin.from('deal_summary_cache').upsert(
      { deal_id: dealId, notes_hash: notesHash, model: MODEL_TAG, summary },
      { onConflict: 'deal_id,notes_hash,model' }
    )
    isNew = true
  }

  const now = new Date().toISOString()
  const updatePayload: Record<string, string> = { ai_summary: summary }
  if (isNew) {
    updatePayload.ai_summary_generated_at = now
  } else {
    const { data: existing } = await admin
      .from('deals')
      .select('ai_summary_generated_at')
      .eq('id', dealId)
      .single()
    if (!existing?.ai_summary_generated_at) {
      updatePayload.ai_summary_generated_at = now
    }
  }

  await admin.from('deals').update(updatePayload).eq('id', dealId)

  const { data: finalDeal } = await admin
    .from('deals')
    .select('ai_summary_generated_at')
    .eq('id', dealId)
    .single()

  return {
    summary,
    isNew,
    generatedAt: finalDeal?.ai_summary_generated_at ?? now,
  }
}
