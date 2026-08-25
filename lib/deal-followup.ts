import type { SupabaseClient } from '@supabase/supabase-js'
import { runInspection, topMissingChecks, type InspectionCheckDef, type InspectionResult } from './deal-inspect'
import { buildDateContext, formatLastNoteLine, type LastNoteStyle } from './ai-date-context'
import { SHARED_GENERATION_RULES, FOLLOW_UP_OUTPUT_RULES } from './ai-prompt-rules'
import { sanitizeGeneratedText } from './ai-sanitize'

// ── Deal follow-up generation ────────────────────────────────────────────────
// The single implementation behind every follow-up surface: the Email and
// Template actions on one deal, and the per-salesperson report covering many.
// Prompt, date awareness, formatting and business rules live here only, so a
// change to any of them reaches both callers at once. Authorisation is the
// caller's job — this module never inspects the session.

const STALE_INSPECTION_HOURS = 2

export class DealFollowUpError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = 'DealFollowUpError'
    this.status = status
  }
}

export interface DealFollowUp {
  dealId:     string
  dealName:   string
  lastNoteLine: string
  /** the numbered items alone, without the two header lines */
  items:      string
  /** deal name, last note line, then the items */
  body:       string
  inspection: InspectionResult | null
}

/**
 * Generate follow-up content for one deal. Runs or reuses the deal inspection,
 * classifies every referenced date against today, then asks the model for the
 * numbered items. The first two lines are assembled here, never generated.
 */
export interface GenerateOptions {
  /** wording of line 2 */
  lastNoteStyle?: LastNoteStyle
  /**
   * Latest note timestamp when the caller already holds it, which skips the
   * lookup below. Pass null to state that the deal has no notes.
   */
  latestNoteAt?: string | null
}

export async function generateDealFollowUp(
  dealId: string,
  admin: SupabaseClient<any>,
  opts: GenerateOptions = {},
): Promise<DealFollowUp> {
  const lastNoteStyle = opts.lastNoteStyle ?? 'prefixed'
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new DealFollowUpError('OPENROUTER_API_KEY not configured', 503)

  const id = dealId

  // Fetch deal metadata + stored inspection result
  const { data: deal, error: dealErr } = await admin
    .from('deals')
    .select('deal_name, deal_description, close_date, value_amount, health_score, ai_summary, deal_owner_id, inspection_result, inspection_run_at, deal_stages ( stage_name )')
    .eq('id', id)
    .single()

  if (dealErr || !deal) throw new DealFollowUpError('Deal not found', 404)

  // Fetch owner name separately to avoid ambiguous FK join
  let ownerName = 'there'
  if (deal.deal_owner_id) {
    const { data: owner } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', deal.deal_owner_id)
      .single()
    if (owner?.full_name) ownerName = owner.full_name
  }

  // Most recent note timestamp, which drives line 2. Skipped when the caller
  // already fetched it, so a multi-deal report does not re-query per deal.
  let latestNoteAt: string | null | undefined = opts.latestNoteAt
  if (latestNoteAt === undefined) {
    const { data: latestNote } = await admin
      .from('notes')
      .select('created_at')
      .eq('entity_type', 'deal')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    latestNoteAt = (latestNote?.created_at as string | undefined) ?? null
  }

  // Determine if we need a fresh inspection
  const staleMs = STALE_INSPECTION_HOURS * 60 * 60 * 1000
  const inspRunAt = deal.inspection_run_at ? new Date(deal.inspection_run_at as string).getTime() : 0
  const inspectionIsStale = (Date.now() - inspRunAt) > staleMs

  let inspectionResult: InspectionResult | null = null

  if (deal.inspection_result && !inspectionIsStale) {
    inspectionResult = deal.inspection_result as InspectionResult
  } else {
    // Run fresh inspection
    try {
      let configChecks: InspectionCheckDef[] | undefined
      const { data: config } = await admin.from('inspection_config').select('checks').limit(1).single()
      if (config?.checks) configChecks = config.checks as InspectionCheckDef[]

      let staleDays = 14
      const { data: hsConfig } = await admin.from('health_score_config').select('stale_days').limit(1).single()
      if (hsConfig?.stale_days) staleDays = hsConfig.stale_days

      inspectionResult = await runInspection(id, admin, configChecks, staleDays)
    } catch (_e) {
      // Proceed without inspection — fall back to summary-only email
    }
  }

  const stagesVal = deal.deal_stages as { stage_name: string }[] | { stage_name: string } | null
  const stageName = (Array.isArray(stagesVal) ? stagesVal[0] : stagesVal)?.stage_name ?? 'Unknown'
  const closeDate = deal.close_date
    ? new Date((deal.close_date as string) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Not set'
  const acv = deal.value_amount != null
    ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(deal.value_amount as number)
    : 'N/A'

  // Build the missing-items block for the email prompt — top 3–6 by severity
  let missingItemsBlock = ''
  if (inspectionResult) {
    const missing = topMissingChecks(inspectionResult, 6)
    if (missing.length > 0) {
      missingItemsBlock = `\nINSPECTION GAPS (deal score ${inspectionResult.score}/100, use these to drive the questions):\n` +
        missing.map(c => `- ${c.question ?? c.explanation}`).join('\n')
    }
  }

  const summaryContext = deal.ai_summary
    ? `DEAL HISTORY:\n${deal.ai_summary}`
    : '(No deal history available)'

  const systemPrompt = `You are a sales manager reviewing a deal for quality and forecast readiness, listing what still needs answering.

Tone: direct, professional, practical. Each item should sound like a manager who has read the deal and wants a specific answer.

Base the items on the inspection gaps provided, prioritising critical gaps.

${FOLLOW_UP_OUTPUT_RULES}

${SHARED_GENERATION_RULES}`

  // Classify every date in the deal data, summary and inspection gaps against
  // today, so stale milestones are reframed rather than asked about as pending.
  const dateContext = buildDateContext(
    [
      deal.close_date as string | null,
      deal.deal_description as string | null,
      deal.ai_summary as string | null,
      missingItemsBlock,
    ],
    new Date(),
  )

  const userContent = `${dateContext}

Deal: "${deal.deal_name as string}"
Owner: ${ownerName}
Stage: ${stageName}
ACV: ${acv}
Close Date: ${closeDate}
Health Score: ${(deal.health_score as number | null) ?? 'N/A'}
Description: ${(deal.deal_description as string | null) ?? 'N/A'}

${summaryContext}
${missingItemsBlock}`

  const model = (process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4-5').trim()

  /** Strip markdown fences and any stray preamble before the first item. */
  function cleanItems(text: string): string {
    let out = text.trim()
    const fenced = out.match(/```(?:\w+)?\s*([\s\S]+?)\s*```/)
    if (fenced) out = fenced[1].trim()
    const firstItem = out.search(/^\s*1[.)]\s+/m)
    if (firstItem > 0) out = out.slice(firstItem).trim()
    return out
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://crm.hostopia.com',
        'X-Title': 'CRM Email Composer',
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new DealFollowUpError(`OpenRouter error ${res.status}: ${txt}`, 502)
    }

    const json = await res.json()
    const items = cleanItems((json.choices?.[0]?.message?.content ?? '').trim())

    if (!items) throw new DealFollowUpError('The model returned no follow-up items', 502)

    // Lines 1 and 2 are assembled here, never generated, so the deal name is
    // always verbatim and the day count always reflects the current date.
    const dealName = deal.deal_name as string
    const lastNoteLine = formatLastNoteLine(latestNoteAt, new Date(), lastNoteStyle)
    // Final guard: no dash and no semicolon may reach the client, whatever the
    // model did. Applied to the items, not the deal name on line 1.
    const cleanedItems = sanitizeGeneratedText(items)
    const body = `${dealName}\n${lastNoteLine}\n\n${cleanedItems}`

    return { dealId, dealName, lastNoteLine, items: cleanedItems, body, inspection: inspectionResult }
  } catch (err) {
    if (err instanceof DealFollowUpError) throw err
    throw new DealFollowUpError(String(err), 502)
  }
}

// ── Persistence ──────────────────────────────────────────────────────────────

/** How long saved follow-up items stay usable before they are regenerated. */
export const FOLLOWUP_MAX_AGE_DAYS = 7

export interface CachedFollowUp extends DealFollowUp {
  /** true when the items came from storage rather than a fresh generation */
  fromCache: boolean
  /** ISO timestamp the items were generated */
  generatedAt: string
  /**
   * Set when regeneration failed and saved items were shown instead, so the
   * caller can surface that without losing the deal from a report.
   */
  staleFallback?: string
}

interface GetOrGenerateOptions extends GenerateOptions {
  /** Regenerate and persist regardless of how fresh the saved items are. */
  force?: boolean
  /** Deal name, when the caller already holds it. Saves a lookup on cache hits. */
  dealName?: string
}

function modelTag(): string {
  return (process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4-5').trim()
}

/**
 * Follow-up items for a deal, reusing saved output when it is recent enough.
 *
 * Only the model output is stored. Lines 1 and 2 are rebuilt on every call from
 * the live deal name and note timestamp, so a cache hit never reports a stale
 * "days since last note" figure.
 */
export async function getOrGenerateDealFollowUp(
  dealId: string,
  admin: SupabaseClient<any>,
  opts: GetOrGenerateOptions = {},
): Promise<CachedFollowUp> {
  const { force = false, dealName: knownName, ...genOpts } = opts
  const lastNoteStyle = genOpts.lastNoteStyle ?? 'prefixed'

  const { data: cached } = await admin
    .from('deal_followup_cache')
    .select('items, generated_at')
    .eq('deal_id', dealId)
    .maybeSingle()

  const cachedAt = cached?.generated_at ? new Date(cached.generated_at as string) : null
  const ageMs = cachedAt ? Date.now() - cachedAt.getTime() : Infinity
  const isFresh = !!cached?.items && ageMs <= FOLLOWUP_MAX_AGE_DAYS * 86_400_000

  if (!force && isFresh) {
    const rendered = await renderCached(dealId, cached!.items as string, admin, lastNoteStyle, knownName, genOpts.latestNoteAt)
    return { ...rendered, fromCache: true, generatedAt: cachedAt!.toISOString() }
  }

  try {
    const fresh = await generateDealFollowUp(dealId, admin, genOpts)
    const generatedAt = new Date().toISOString()
    await admin.from('deal_followup_cache').upsert(
      { deal_id: dealId, items: fresh.items, model: modelTag(), generated_at: generatedAt, updated_at: generatedAt },
      { onConflict: 'deal_id' },
    )
    return { ...fresh, fromCache: false, generatedAt }
  } catch (err) {
    // Regeneration failed. Saved items, even past the age limit, beat losing
    // the deal from the report entirely.
    if (cached?.items) {
      const rendered = await renderCached(dealId, cached.items as string, admin, lastNoteStyle, knownName, genOpts.latestNoteAt)
      return {
        ...rendered,
        fromCache: true,
        generatedAt: (cachedAt ?? new Date()).toISOString(),
        staleFallback: err instanceof Error ? err.message : String(err),
      }
    }
    throw err
  }
}

/** Rebuild the two header lines around saved items using current data. */
async function renderCached(
  dealId: string,
  items: string,
  admin: SupabaseClient<any>,
  lastNoteStyle: LastNoteStyle,
  knownName: string | undefined,
  knownLatestNoteAt: string | null | undefined,
): Promise<DealFollowUp> {
  let dealName = knownName
  if (!dealName) {
    const { data: deal } = await admin.from('deals').select('deal_name').eq('id', dealId).single()
    if (!deal) throw new DealFollowUpError('Deal not found', 404)
    dealName = deal.deal_name as string
  }

  let latestNoteAt: string | null | undefined = knownLatestNoteAt
  if (latestNoteAt === undefined) {
    const { data: latestNote } = await admin
      .from('notes')
      .select('created_at')
      .eq('entity_type', 'deal')
      .eq('entity_id', dealId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    latestNoteAt = (latestNote?.created_at as string | undefined) ?? null
  }

  const lastNoteLine = formatLastNoteLine(latestNoteAt, new Date(), lastNoteStyle)
  return {
    dealId,
    dealName,
    lastNoteLine,
    items,
    body: `${dealName}\n${lastNoteLine}\n\n${items}`,
    inspection: null,
  }
}
