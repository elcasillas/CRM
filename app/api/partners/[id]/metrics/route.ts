import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

// GET /api/partners/[id]/metrics?month=YYYY-MM-DD
// Returns all metric rows for the given partner and month (defaults to current month)
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const monthParam = url.searchParams.get('month')
  const month = monthParam ?? new Date().toISOString().slice(0, 7) + '-01'

  const { data, error } = await supabase
    .from('partner_metrics')
    .select('*')
    .eq('partner_id', id)
    .eq('metric_date', month)
    .order('category')
    .order('metric_key')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/partners/[id]/metrics
// Upserts metric values for a partner + month.
// Body: { metric_date: string, metrics: Array<{ key: string, category: string, value: number|null }> }
// Triggers score recompute via Postgres trigger on partner_metrics.
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify access
  const { data: partner, error: pErr } = await supabase
    .from('partners')
    .select('id')
    .eq('id', id)
    .single()

  if (pErr || !partner) {
    return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
  }

  const body = await request.json()
  const { metric_date, metrics } = body as {
    metric_date: string
    metrics: Array<{ key: string; category: string; value: number | null }>
  }

  if (!metric_date || !Array.isArray(metrics)) {
    return NextResponse.json({ error: 'metric_date and metrics array are required' }, { status: 400 })
  }

  // Validate metric_date is first of month
  const d = new Date(metric_date)
  if (isNaN(d.getTime()) || d.getDate() !== 1) {
    return NextResponse.json({ error: 'metric_date must be the first day of a month (YYYY-MM-01)' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Upsert each metric row
  const rows = metrics
    .filter(m => m.key && m.category)
    .map(m => ({
      partner_id:   id,
      metric_date,
      category:     m.category,
      metric_key:   m.key,
      metric_value: m.value ?? null,
      source:       'manual' as const,
      created_by:   user.id,
    }))

  if (rows.length === 0) {
    return NextResponse.json({ updated: 0 })
  }

  const { error } = await admin
    .from('partner_metrics')
    .upsert(rows, { onConflict: 'partner_id,metric_date,metric_key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The Postgres trigger on partner_metrics automatically calls
  // recompute_partner_health_score — fetch the updated score to return
  const { data: updatedScore } = await admin
    .from('partner_health_scores')
    .select('overall_score, health_status, confidence_score, category_scores, computed_at')
    .eq('partner_id', id)
    .single()

  return NextResponse.json({ updated: rows.length, score: updatedScore })
}
