import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runInspection, topMissingChecks, type InspectionCheckDef, type InspectionResult } from '@/lib/deal-inspect'

// ── POST — compose an AI-generated follow-up email about a deal ───────────────
// Runs (or reuses) a deal inspection, then generates a targeted manager email
// asking the rep specifically about the top missing or weak items.
// Returns { subject: string, body: string }

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
  const ownerFirst = ownerName.split(' ')[0] ?? ownerName

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
    ? `AI SUMMARY:\n${deal.ai_summary}`
    : '(No AI summary available)'

  const systemPrompt = `You are a sales manager writing an internal follow-up email to a deal owner about deal quality and forecast readiness.

Tone: direct, professional, practical. Sound like a manager who has reviewed the deal and wants specific answers — not a form letter.

Return a JSON object with exactly two keys:
- "subject": short, specific subject line under 60 characters — reference the deal name
- "body": the email body as plain text

Rules for the body:
- Open: "Hi ${ownerFirst},"
- One sentence: why you're writing (reviewed "${deal.deal_name as string}", need a few updates before forecast review, or similar — be specific to the deal)
- List 3 to 6 questions as dash-separated lines. Use the inspection gaps provided. Prioritize critical gaps. Write each question as a direct, specific ask — no fluff, no preamble
- One closing sentence: brief request to update the deal record or reply before the next review
- Sign off: "Thanks"
- Plain text only — no markdown, no bullet symbols other than dashes, no headers
- Under 160 words total`

  const userContent = `Deal: "${deal.deal_name as string}"
Owner: ${ownerName}
Stage: ${stageName}
ACV: ${acv}
Close Date: ${closeDate}
Health Score: ${(deal.health_score as number | null) ?? 'N/A'}
Description: ${(deal.deal_description as string | null) ?? 'N/A'}

${summaryContext}
${missingItemsBlock}`

  const model = (process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4-5').trim()

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://crm-six-roan.vercel.app',
        'X-Title': 'CRM Email Composer',
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        response_format: { type: 'json_object' },
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
    const raw = (json.choices?.[0]?.message?.content ?? '').trim()
    const parsed = JSON.parse(raw)

    if (!parsed.subject || !parsed.body) {
      return NextResponse.json({ error: 'Invalid response from AI' }, { status: 502 })
    }

    return NextResponse.json({
      subject:    parsed.subject as string,
      body:       parsed.body as string,
      inspection: inspectionResult,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
