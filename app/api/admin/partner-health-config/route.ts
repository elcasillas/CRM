import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/api-helpers'

// GET /api/admin/partner-health-config
export async function GET() {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('partner_health_config')
    .select('id, category_weights, thresholds, stale_days, model_version')
    .limit(1)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PUT /api/admin/partner-health-config
export async function PUT(request: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, category_weights, thresholds, stale_days, model_version } = await request.json()

  if (!category_weights) {
    return NextResponse.json({ error: 'category_weights is required' }, { status: 400 })
  }

  // Validate weights sum to 100
  const total = Object.values(category_weights as Record<string, number>).reduce((s, v) => s + v, 0)
  if (Math.abs(total - 100) > 0.5) {
    return NextResponse.json(
      { error: `Category weights must sum to 100 (got ${total.toFixed(1)})` },
      { status: 400 }
    )
  }

  // Validate thresholds ordering
  if (thresholds) {
    const { healthy, at_risk, critical } = thresholds as { healthy: number; at_risk: number; critical: number }
    if (healthy <= at_risk || at_risk <= critical) {
      return NextResponse.json(
        { error: 'Thresholds must be in order: healthy > at_risk > critical' },
        { status: 400 }
      )
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('partner_health_config')
    .update({
      category_weights,
      thresholds:    thresholds    ?? undefined,
      stale_days:    Number(stale_days)    || 30,
      model_version: model_version || 'phi-1',
      updated_at:    new Date().toISOString(),
      updated_by:    caller.id,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
