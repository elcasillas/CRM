import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return profile?.role === 'admin' ? user : null
}

// GET /api/admin/health-score-config
export async function GET() {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('health_score_config')
    .select('id, weights, keywords')
    .limit(1)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PUT /api/admin/health-score-config
export async function PUT(request: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, weights, keywords } = await request.json()

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
    .update({ weights, keywords, updated_at: new Date().toISOString(), updated_by: caller.id })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
