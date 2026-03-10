import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/api-helpers'
import { DEFAULT_CHECKS, type InspectionCheckDef } from '@/lib/deal-inspect'

// GET /api/admin/inspection-config
export async function GET() {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('inspection_config')
    .select('id, checks')
    .limit(1)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Merge stored checks with defaults so newly added default checks are always present
  const storedMap = new Map<string, InspectionCheckDef>(
    ((data?.checks ?? []) as InspectionCheckDef[]).map((c: InspectionCheckDef) => [c.id, c])
  )
  const mergedChecks: InspectionCheckDef[] = DEFAULT_CHECKS.map(def => ({
    ...def,
    ...(storedMap.get(def.id) ?? {}),
  }))

  return NextResponse.json({ id: data?.id ?? null, checks: mergedChecks })
}

// PUT /api/admin/inspection-config
export async function PUT(request: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, checks } = await request.json()

  if (!Array.isArray(checks)) {
    return NextResponse.json({ error: 'checks must be an array' }, { status: 400 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  if (id) {
    const { error } = await admin
      .from('inspection_config')
      .update({ checks, updated_at: now, updated_by: caller.id })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // First-time insert (should not happen after migration seeds the row)
    const { error } = await admin
      .from('inspection_config')
      .insert({ checks, updated_at: now, updated_by: caller.id })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
