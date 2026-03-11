import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/partners/[id] — update partner metadata
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile as { role: string } | null)?.role ?? ''
  const isAdmin = role === 'admin'

  // Verify the partner exists and the user can access it
  const { data: existing, error: fetchErr } = await supabase
    .from('partners')
    .select('id, account_manager_id')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
  }

  // Only admin or the assigned account manager can update
  if (!isAdmin && existing.account_manager_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const {
    partner_name,
    partner_type,
    tier,
    status,
    account_id,
    account_manager_id,
    region,
    country,
    website,
    description,
  } = body

  // Non-admin cannot reassign the account manager
  const updates: Record<string, unknown> = {
    ...(partner_name       !== undefined ? { partner_name: partner_name.trim() } : {}),
    ...(partner_type       !== undefined ? { partner_type }                      : {}),
    ...(tier               !== undefined ? { tier }                              : {}),
    ...(status             !== undefined ? { status }                            : {}),
    ...(account_id         !== undefined ? { account_id: account_id || null }    : {}),
    ...(region             !== undefined ? { region: region || null }            : {}),
    ...(country            !== undefined ? { country: country || null }          : {}),
    ...(website            !== undefined ? { website: website || null }          : {}),
    ...(description        !== undefined ? { description: description || null }  : {}),
  }

  if (isAdmin && account_manager_id !== undefined) {
    updates.account_manager_id = account_manager_id || null
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('partners')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/partners/[id] — delete partner (admin only)
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if ((profile as { role: string } | null)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('partners').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
