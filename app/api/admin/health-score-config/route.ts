import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/api-helpers'

// GET /api/admin/health-score-config
export async function GET() {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('health_score_config')
    .select('id, weights, keywords, stale_days, new_deal_days')
    .limit(1)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PUT /api/admin/health-score-config
export async function PUT(request: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, weights, keywords, stale_days, new_deal_days } = await request.json()

  if (!weights || !keywords) {
    return NextResponse.json({ error: 'weights and keywords are required' }, { status: 400 })
  }

  const total = Object.values(weights as Record<string, number>).reduce((s, v) => s + v, 0)
  if (Math.abs(total - 100) > 0.5) {
    return NextResponse.json({ error: `Weights must sum to 100 (got ${total.toFixed(1)})` }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('health_score_config')
    .update({ weights, keywords, stale_days: Number(stale_days) || 30, new_deal_days: Number(new_deal_days) || 14, updated_at: new Date().toISOString(), updated_by: caller.id })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
