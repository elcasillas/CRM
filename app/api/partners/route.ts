import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/partners — list partners for dropdowns (any authenticated user)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('partners')
    .select('id, partner_name, partner_type, tier, status, account_manager_id')
    .order('partner_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/partners — create a partner
export async function POST(request: NextRequest) {
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
  const isManager = role === 'sales_manager'

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

  if (!partner_name?.trim()) {
    return NextResponse.json({ error: 'partner_name is required' }, { status: 400 })
  }
  if (!partner_type) {
    return NextResponse.json({ error: 'partner_type is required' }, { status: 400 })
  }

  // Only admin or sales_manager can create partners
  if (!isAdmin && !isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Non-admin must assign themselves as account manager
  const effectiveManagerId = isAdmin
    ? (account_manager_id || user.id)
    : user.id

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('partners')
    .insert({
      partner_name: partner_name.trim(),
      partner_type,
      tier:               tier               ?? 'tier2',
      status:             status             ?? 'active',
      account_id:         account_id         || null,
      account_manager_id: effectiveManagerId || null,
      region:             region             || null,
      country:            country            || null,
      website:            website            || null,
      description:        description        || null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
