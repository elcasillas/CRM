import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_ROLES = ['admin', 'sales', 'service_manager', 'read_only'] as const

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

// POST /api/admin/users — create a new user
export async function POST(request: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, password, full_name, role } = await request.json()

  if (!email?.trim() || !password?.trim()) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const targetRole = VALID_ROLES.includes(role) ? role : 'sales'

  const admin = createAdminClient()

  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name?.trim() || email.trim() },
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  if (newUser.user) {
    // The handle_new_user trigger auto-creates the profile row with role='sales'.
    // Upsert here to set the requested role and full_name.
    await admin
      .from('profiles')
      .upsert({
        id: newUser.user.id,
        role: targetRole,
        full_name: full_name?.trim() || null,
      }, { onConflict: 'id' })
  }

  return NextResponse.json({ success: true, userId: newUser.user?.id })
}

// PATCH /api/admin/users — update a user's role
export async function PATCH(request: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId, role } = await request.json()

  if (!userId || !role) {
    return NextResponse.json({ error: 'userId and role are required' }, { status: 400 })
  }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ role }).eq('id', userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
