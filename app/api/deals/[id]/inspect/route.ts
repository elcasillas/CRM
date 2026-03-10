import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runInspection, type InspectionCheckDef } from '@/lib/deal-inspect'

// ── GET — return stored inspection result ────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('deals')
    .select('inspection_result, inspection_score, inspection_run_at')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  return NextResponse.json({
    result:  data.inspection_result ?? null,
    score:   data.inspection_score  ?? null,
    runAt:   data.inspection_run_at ?? null,
  })
}

// ── POST — run inspection, store result ──────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Load inspection config (for admin-overridden severities/enabled flags)
  let configChecks: InspectionCheckDef[] | undefined
  const { data: config } = await admin
    .from('inspection_config')
    .select('checks')
    .limit(1)
    .single()
  if (config?.checks) {
    configChecks = config.checks as InspectionCheckDef[]
  }

  // Load stale_days from health_score_config
  let staleDays = 14
  const { data: hsConfig } = await admin
    .from('health_score_config')
    .select('stale_days')
    .limit(1)
    .single()
  if (hsConfig?.stale_days) staleDays = hsConfig.stale_days

  let result
  try {
    result = await runInspection(id, admin, configChecks, staleDays)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  if (!result) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  return NextResponse.json({ result })
}
