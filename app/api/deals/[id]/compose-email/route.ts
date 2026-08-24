import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runInspection, topMissingChecks, type InspectionCheckDef, type InspectionResult } from '@/lib/deal-inspect'
import { buildDateContext, formatLastNoteLine } from '@/lib/ai-date-context'
import { SHARED_GENERATION_RULES, FOLLOW_UP_OUTPUT_RULES } from '@/lib/ai-prompt-rules'

// ── POST — compose follow-up content for a deal ──────────────────────────────
// Runs (or reuses) a deal inspection, then generates targeted follow-up items
// about the top missing or weak parts of the deal. The deal name and "Last
// note" lines are prepended here rather than generated, so they are always
// exact. Returns { subject: string, body: string }

const STALE_INSPECTION_HOURS = 2

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 503 })

  const admin = createAdminClient()

  // Fetch deal metadata + stored inspection result
  const { data: deal, error: dealErr } = await admin
    .from('deals')
    .select('deal_name, deal_description, close_date, value_amount, health_score, ai_summary, deal_owner_id, inspection_result, inspection_run_at, deal_stages ( stage_name )')
    .eq('id', id)
    .single()

  if (dealErr || !deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

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

  // Most recent note timestamp — drives the "Last note:" line
  const { data: latestNote } = await admin
    .from('notes')
    .select('created_at')
    .eq('entity_type', 'deal')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

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
      missingItemsBlock = `\nINSPECTION GAPS (deal score ${inspectionResult.score}/100 — use these to drive the questions):\n` +
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
      return NextResponse.json({ error: `OpenRouter error ${res.status}: ${txt}` }, { status: 502 })
    }

    const json = await res.json()
    const items = cleanItems((json.choices?.[0]?.message?.content ?? '').trim())

    if (!items) {
      return NextResponse.json({ error: 'Invalid response from AI' }, { status: 502 })
    }

    // Lines 1 and 2 are assembled here, never generated, so the deal name is
    // always verbatim and the day count always reflects the current date.
    const dealName = deal.deal_name as string
    const lastNoteLine = formatLastNoteLine(latestNote?.created_at as string | undefined, new Date())
    const body = `${dealName}\n${lastNoteLine}\n\n${items}`

    return NextResponse.json({
      subject:    dealName,
      body,
      inspection: inspectionResult,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
