import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrCreateSummary } from './deal-summarize'
import { extractDealRevenue } from './dealCalc'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InspectionCheckDef {
  id:       string
  label:    string
  severity: 'critical' | 'medium' | 'low'
  enabled:  boolean
}

export interface CheckResult {
  id:          string
  label:       string
  status:      'pass' | 'missing' | 'weak' | 'stale' | 'mismatch'
  explanation: string
  question:    string | null
  severity:    'critical' | 'medium' | 'low'
}

export interface InspectionResult {
  checks: CheckResult[]
  score:  number
  runAt:  string
}

// ── Default check definitions ─────────────────────────────────────────────────

export const DEFAULT_CHECKS: InspectionCheckDef[] = [
  { id: 'stage_valid',           label: 'Deal stage is present and valid',                    severity: 'critical', enabled: true },
  { id: 'close_date_credible',   label: 'Close date is present and still credible',           severity: 'critical', enabled: true },
  { id: 'amount_reasonable',     label: 'Amount is present and reasonable',                   severity: 'critical', enabled: true },
  { id: 'contract_term',         label: 'Contract term is present',                           severity: 'medium',   enabled: true },
  { id: 'acv_tcv_aligned',       label: 'ACV and TCV are present and aligned',                severity: 'medium',   enabled: true },
  { id: 'next_step_defined',     label: 'Next step is clearly defined',                       severity: 'critical', enabled: true },
  { id: 'next_step_owner',       label: 'Next step owner is clear',                           severity: 'medium',   enabled: true },
  { id: 'next_step_date',        label: 'Next step date is present',                          severity: 'medium',   enabled: true },
  { id: 'recent_update',         label: 'Last meaningful update is recent',                   severity: 'medium',   enabled: true },
  { id: 'decision_process',      label: 'Customer decision process is described',             severity: 'critical', enabled: true },
  { id: 'economic_buyer',        label: 'Executive decision maker is identified',             severity: 'critical', enabled: true },
  { id: 'business_problem',      label: 'Business problem or use case is defined',            severity: 'medium',   enabled: true },
  { id: 'blockers_documented',   label: 'Blockers or risks are documented',                   severity: 'medium',   enabled: true },
  { id: 'customer_intent',       label: 'Customer intent or commitment level is described',   severity: 'critical', enabled: true },
  { id: 'implementation_target', label: 'Timeline or implementation target is documented',    severity: 'low',      enabled: true },
]

// IDs evaluated programmatically (no LLM needed)
const STRUCTURED_CHECK_IDS = new Set([
  'stage_valid', 'close_date_credible', 'amount_reasonable',
  'contract_term', 'acv_tcv_aligned', 'recent_update',
])

// ── Scoring ───────────────────────────────────────────────────────────────────

export function computeScore(checks: CheckResult[]): number {
  const weights: Record<string, number> = { critical: 3, medium: 2, low: 1 }
  let total = 0
  let earned = 0
  for (const c of checks) {
    const w = weights[c.severity] ?? 1
    total += w
    if (c.status === 'pass')                earned += w
    else if (c.status === 'weak' || c.status === 'stale') earned += w * 0.4
    // missing / mismatch → 0
  }
  return total > 0 ? Math.round((earned / total) * 100) : 0
}

// ── Programmatic checks (structured fields only) ───────────────────────────────

interface DealFields {
  stage_id:             string | null
  close_date:           string | null
  amount:               number | null
  contract_term_months: number | null
  value_amount:         number | null
  total_contract_value: number | null
  last_activity_at:     string | null
  updated_at:           string | null
}

export function evaluateStructuredChecks(
  deal: DealFields,
  enabledDefs: InspectionCheckDef[],
  staleDays: number,
  todayStr: string,
): CheckResult[] {
  const results: CheckResult[] = []
  const defMap = new Map(enabledDefs.map(d => [d.id, d]))

  // 1. stage_valid
  if (defMap.has('stage_valid')) {
    const def = defMap.get('stage_valid')!
    if (deal.stage_id) {
      results.push({ id: def.id, label: def.label, status: 'pass', explanation: 'A deal stage is assigned.', question: null, severity: def.severity })
    } else {
      results.push({ id: def.id, label: def.label, status: 'missing', explanation: 'No deal stage is assigned.', question: 'What stage is this deal currently in?', severity: def.severity })
    }
  }

  // 2. close_date_credible
  if (defMap.has('close_date_credible')) {
    const def = defMap.get('close_date_credible')!
    if (!deal.close_date) {
      results.push({ id: def.id, label: def.label, status: 'missing', explanation: 'No close date has been set.', question: 'What is the expected close date for this deal?', severity: def.severity })
    } else if (deal.close_date < todayStr) {
      results.push({ id: def.id, label: def.label, status: 'stale', explanation: `Close date (${deal.close_date}) is in the past.`, question: 'Has the close date changed? Please update it to reflect the current expected timeline.', severity: def.severity })
    } else {
      results.push({ id: def.id, label: def.label, status: 'pass', explanation: `Close date is set to ${deal.close_date}.`, question: null, severity: def.severity })
    }
  }

  // 3. amount_reasonable
  if (defMap.has('amount_reasonable')) {
    const def = defMap.get('amount_reasonable')!
    const rev = extractDealRevenue(deal)
    if (!rev.hasRevenue) {
      results.push({ id: def.id, label: def.label, status: 'missing', explanation: 'No revenue amount has been entered for this deal.', question: 'What is the contract amount for this deal?', severity: def.severity })
    } else if (rev.isOneTime) {
      results.push({ id: def.id, label: def.label, status: 'pass', explanation: `One-time deal value is $${Math.round(rev.acv).toLocaleString()} (ACV).`, question: null, severity: def.severity })
    } else {
      results.push({ id: def.id, label: def.label, status: 'pass', explanation: `MRR is set to $${Math.round(rev.mrr).toLocaleString()}.`, question: null, severity: def.severity })
    }
  }

  // 4. contract_term
  if (defMap.has('contract_term')) {
    const def = defMap.get('contract_term')!
    if (!deal.contract_term_months || deal.contract_term_months <= 0) {
      results.push({ id: def.id, label: def.label, status: 'missing', explanation: 'Contract term (months) has not been entered.', question: 'What is the contract term in months?', severity: def.severity })
    } else {
      results.push({ id: def.id, label: def.label, status: 'pass', explanation: `Contract term is ${deal.contract_term_months} months.`, question: null, severity: def.severity })
    }
  }

  // 5. acv_tcv_aligned
  if (defMap.has('acv_tcv_aligned')) {
    const def = defMap.get('acv_tcv_aligned')!
    const rev = extractDealRevenue(deal)

    if (rev.acv <= 0) {
      // No ACV at all — could not be computed
      results.push({ id: def.id, label: def.label, status: 'missing', explanation: 'ACV has not been computed — likely because the revenue amount is missing.', question: 'Please confirm the contract amount so ACV and TCV can be calculated.', severity: def.severity })
    } else if (rev.tcv <= 0 && rev.term > 0) {
      // ACV is present but TCV is missing despite a term being set — data gap
      results.push({ id: def.id, label: def.label, status: 'missing', explanation: `ACV is $${Math.round(rev.acv).toLocaleString()} but TCV is not recorded despite a ${rev.term}-month term.`, question: 'Please verify the total contract value is correctly set.', severity: def.severity })
    } else if (rev.tcv <= 0) {
      // No term → TCV cannot be computed; ACV alone is acceptable (one-time or term not entered)
      results.push({ id: def.id, label: def.label, status: 'pass', explanation: `ACV is $${Math.round(rev.acv).toLocaleString()}${rev.isOneTime ? ' (one-time)' : '; TCV not computed — no contract term set'}.`, question: null, severity: def.severity })
    } else {
      // Both ACV and TCV present — verify rough alignment (±5% tolerance for rounding)
      const expectedTcv = rev.term === 1 ? rev.acv : (rev.mrr > 0 ? rev.mrr * rev.term : rev.acv)
      const ratio = expectedTcv > 0 ? Math.abs(rev.tcv - expectedTcv) / expectedTcv : 0
      if (ratio > 0.05 && expectedTcv > 0) {
        results.push({ id: def.id, label: def.label, status: 'mismatch', explanation: `ACV is $${Math.round(rev.acv).toLocaleString()} and TCV is $${Math.round(rev.tcv).toLocaleString()}, but they appear misaligned for a ${rev.term}-month term.`, question: 'Do the ACV and TCV values look correct for this contract?', severity: def.severity })
      } else {
        results.push({ id: def.id, label: def.label, status: 'pass', explanation: `ACV is $${Math.round(rev.acv).toLocaleString()} and TCV is $${Math.round(rev.tcv).toLocaleString()}.`, question: null, severity: def.severity })
      }
    }
  }

  // 9. recent_update
  if (defMap.has('recent_update')) {
    const def = defMap.get('recent_update')!
    const lastTs = deal.last_activity_at ?? deal.updated_at
    if (!lastTs) {
      results.push({ id: def.id, label: def.label, status: 'missing', explanation: 'No activity timestamp recorded.', question: 'When was the last meaningful update on this deal?', severity: def.severity })
    } else {
      const daysSince = Math.floor((Date.now() - new Date(lastTs).getTime()) / 86400000)
      if (daysSince >= staleDays) {
        results.push({ id: def.id, label: def.label, status: 'stale', explanation: `Last update was ${daysSince} days ago, which exceeds the ${staleDays}-day threshold.`, question: 'What is the latest status? Have there been any recent customer interactions not yet logged?', severity: def.severity })
      } else {
        results.push({ id: def.id, label: def.label, status: 'pass', explanation: `Last update was ${daysSince} day${daysSince !== 1 ? 's' : ''} ago.`, question: null, severity: def.severity })
      }
    }
  }

  return results
}

// ── JSON extraction helper (handles Claude's markdown-wrapped responses) ───────

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  if (fenced) return fenced[1]
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) return text.slice(start, end + 1)
  return text
}

// ── LLM-based qualitative checks ─────────────────────────────────────────────

interface DealContext {
  deal_name:        string
  deal_description: string | null
  stage_name:       string | null
  owner_name:       string | null
  close_date:       string | null
  ai_summary:       string | null
}

async function callInspectionLLM(
  ctx: DealContext,
  notes: string[],
  pendingDefs: InspectionCheckDef[],
): Promise<CheckResult[]> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured')
  const model = (process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4-5').trim()

  const checksSpec = pendingDefs.map((d, i) =>
    `${i + 1}. id="${d.id}" — ${d.label}`
  ).join('\n')

  const notesBlock = notes.length > 0
    ? notes.map(n => `- ${n.trim()}`).join('\n')
    : '(no notes available)'

  const summaryBlock = ctx.ai_summary
    ? `AI SUMMARY:\n${ctx.ai_summary}`
    : '(no AI summary available)'

  const systemPrompt = `You are a CRM deal quality inspector for a sales manager.

Evaluate the provided deal against the listed inspection criteria and return a JSON object with a "checks" array.

For each check return:
- "id": exact id string from the criterion
- "status": one of "pass", "missing", "weak", "stale", "mismatch"
  - pass = information is clearly present and credible
  - missing = completely absent
  - weak = present but vague, unconvincing, or very generic
  - stale = exists but likely outdated
  - mismatch = two pieces of information contradict each other
- "explanation": one sentence describing the finding
- "question": a direct, manager-friendly question to ask the rep (null if status is "pass")

Criteria to evaluate:
${checksSpec}

Rules:
- Base your evaluation on the AI summary and recent notes
- If there is no AI summary and no notes, mark all qualitative checks as "missing"
- Be concise and specific
- Return ONLY valid JSON, no markdown`

  const userContent = `Deal: "${ctx.deal_name}"
Stage: ${ctx.stage_name ?? 'Unknown'}
Owner: ${ctx.owner_name ?? 'Unknown'}
Close Date: ${ctx.close_date ?? 'Not set'}
Description: ${ctx.deal_description ?? 'None'}

${summaryBlock}

Recent Notes:
${notesBlock}`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://crm-six-roan.vercel.app',
      'X-Title': 'CRM Deal Inspector',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1400,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenRouter error ${res.status}: ${txt}`)
  }

  const json = await res.json()
  const raw = (json.choices?.[0]?.message?.content ?? '').trim()
  const parsed = JSON.parse(extractJSON(raw))
  const rawChecks: Array<{ id: string; status: string; explanation: string; question: string | null }> =
    parsed.checks ?? []

  // Merge LLM output with def metadata (label + severity)
  const defMap = new Map(pendingDefs.map(d => [d.id, d]))
  return rawChecks
    .filter(c => defMap.has(c.id))
    .map(c => {
      const def = defMap.get(c.id)!
      const validStatuses = ['pass', 'missing', 'weak', 'stale', 'mismatch']
      const status = validStatuses.includes(c.status) ? c.status as CheckResult['status'] : 'missing'
      return {
        id:          c.id,
        label:       def.label,
        status,
        explanation: c.explanation ?? '',
        question:    status === 'pass' ? null : (c.question ?? null),
        severity:    def.severity,
      }
    })
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runInspection(
  dealId: string,
  admin: SupabaseClient<any>,
  configChecks?: InspectionCheckDef[],
  staleDays = 14,
): Promise<InspectionResult | null> {
  // Merge config overrides into defaults
  const effectiveDefs: InspectionCheckDef[] = DEFAULT_CHECKS.map(def => {
    const override = configChecks?.find(c => c.id === def.id)
    if (!override) return def
    return { ...def, severity: override.severity, enabled: override.enabled }
  }).filter(d => d.enabled)

  // Fetch deal with stage and owner info
  const { data: deal, error: dealErr } = await admin
    .from('deals')
    .select('deal_name, deal_description, stage_id, deal_owner_id, close_date, amount, contract_term_months, value_amount, total_contract_value, last_activity_at, updated_at, ai_summary, deal_stages ( stage_name )')
    .eq('id', dealId)
    .single()

  if (dealErr || !deal) return null

  // Owner name
  let ownerName: string | null = null
  if (deal.deal_owner_id) {
    const { data: owner } = await admin.from('profiles').select('full_name').eq('id', deal.deal_owner_id).single()
    ownerName = owner?.full_name ?? null
  }

  const stagesVal = deal.deal_stages as { stage_name: string }[] | { stage_name: string } | null
  const stageName = (Array.isArray(stagesVal) ? stagesVal[0] : stagesVal)?.stage_name ?? null

  // Ensure AI summary exists
  let summary = deal.ai_summary as string | null
  if (!summary) {
    try {
      const sumResult = await getOrCreateSummary(dealId, admin)
      summary = sumResult?.summary ?? null
    } catch (_e) { /* inspection proceeds without summary */ }
  }

  // Recent notes (up to 5)
  const { data: notesRows } = await admin
    .from('notes')
    .select('note_text')
    .eq('entity_type', 'deal')
    .eq('entity_id', dealId)
    .order('created_at', { ascending: false })
    .limit(5)
  const notes = (notesRows ?? []).map((n: { note_text: string }) => n.note_text)

  const todayStr = new Date().toISOString().split('T')[0]

  // Programmatic checks (subset of effectiveDefs)
  const structuredDefs = effectiveDefs.filter(d => STRUCTURED_CHECK_IDS.has(d.id))
  const qualitativeDefs = effectiveDefs.filter(d => !STRUCTURED_CHECK_IDS.has(d.id))

  const structuredResults = evaluateStructuredChecks(
    {
      stage_id:             deal.stage_id,
      close_date:           deal.close_date,
      amount:               deal.amount,
      contract_term_months: deal.contract_term_months,
      value_amount:         deal.value_amount,
      total_contract_value: deal.total_contract_value,
      last_activity_at:     deal.last_activity_at,
      updated_at:           deal.updated_at,
    },
    structuredDefs,
    staleDays,
    todayStr,
  )

  // LLM checks
  let llmResults: CheckResult[] = []
  if (qualitativeDefs.length > 0) {
    try {
      llmResults = await callInspectionLLM(
        {
          deal_name:        deal.deal_name,
          deal_description: deal.deal_description,
          stage_name:       stageName,
          owner_name:       ownerName,
          close_date:       deal.close_date,
          ai_summary:       summary,
        },
        notes,
        qualitativeDefs,
      )
    } catch (_e) {
      // Fallback: mark all qualitative checks as missing
      llmResults = qualitativeDefs.map(def => ({
        id:          def.id,
        label:       def.label,
        status:      'missing' as const,
        explanation: 'Could not evaluate — AI inspection unavailable.',
        question:    `Please provide an update on: ${def.label.toLowerCase()}.`,
        severity:    def.severity,
      }))
    }
  }

  // Merge in original DEFAULT_CHECKS order
  const allResults = DEFAULT_CHECKS
    .filter(def => effectiveDefs.some(d => d.id === def.id))
    .map(def => {
      return (
        structuredResults.find(r => r.id === def.id) ??
        llmResults.find(r => r.id === def.id) ??
        null
      )
    })
    .filter((r): r is CheckResult => r !== null)

  const score = computeScore(allResults)
  const runAt = new Date().toISOString()

  // Persist to deals table
  await admin.from('deals').update({
    inspection_score:  score,
    inspection_run_at: runAt,
    inspection_result: { checks: allResults, score, runAt },
  }).eq('id', dealId)

  return { checks: allResults, score, runAt }
}

// ── Helpers for email generation ──────────────────────────────────────────────

/**
 * Returns the top non-passing checks ordered by severity, limited to count.
 */
export function topMissingChecks(result: InspectionResult, count = 5): CheckResult[] {
  const severityOrder: Record<string, number> = { critical: 0, medium: 1, low: 2 }
  return result.checks
    .filter(c => c.status !== 'pass' && c.question)
    .sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2))
    .slice(0, count)
}
