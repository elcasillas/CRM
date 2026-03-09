import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── POST — compose an AI-generated follow-up email about a deal ───────────────
// Uses stored ai_summary as primary context for email generation.
// Returns { subject: string, body: string }

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

  // Fetch deal metadata
  const { data: deal, error: dealErr } = await admin
    .from('deals')
    .select('deal_name, deal_description, close_date, value_amount, health_score, ai_summary, deal_owner_id, deal_stages ( stage_name )')
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

  const stageName = (deal.deal_stages as { stage_name: string } | null)?.stage_name ?? 'Unknown'
  const closeDate = deal.close_date
    ? new Date(deal.close_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Not set'
  const acv = deal.value_amount != null
    ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(deal.value_amount)
    : 'N/A'

  const summaryContext = deal.ai_summary
    ? `AI SUMMARY:\n${deal.ai_summary}`
    : '(No AI summary available — rely on deal metadata only)'

  const systemPrompt = `You are a CRM assistant drafting professional follow-up emails for sales managers.

Given deal information and an AI summary, write a concise, professional internal status-check email.

Return your response as a JSON object with exactly two keys:
- "subject": a short, specific email subject line (under 60 characters)
- "body": the full email body as plain text

Rules for the body:
- Begin with "Hi [owner name],"
- First paragraph: brief current status based on the AI summary
- Second paragraph: any blockers or risks worth flagging (skip if none)
- Final paragraph: clear ask — what action or update is needed
- Sign off with "Thanks"
- Keep it under 150 words total
- Plain text only — no markdown, no bullet points, no headers`

  const userContent = `Deal: "${deal.deal_name}"
Owner: ${ownerName}
Stage: ${stageName}
ACV: ${acv}
Close Date: ${closeDate}
Health Score: ${deal.health_score ?? 'N/A'}
Description: ${deal.deal_description ?? 'N/A'}

${summaryContext}`

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
        max_tokens: 600,
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

    return NextResponse.json({ subject: parsed.subject as string, body: parsed.body as string })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
