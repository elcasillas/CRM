import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_ROLES = ['admin', 'sales', 'sales_manager', 'solutions_engineer', 'service_manager', 'read_only'] as const

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

// GET /api/admin/users — list auth users (id, email, created_at)
export async function GET() {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    (data.users ?? []).map(u => ({
      id:         u.id,
      email:      u.email ?? '',
      created_at: u.created_at,
    }))
  )
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
    await admin
      .from('profiles')
      .upsert({
        id:        newUser.user.id,
        role:      targetRole,
        full_name: full_name?.trim() || null,
      }, { onConflict: 'id' })
  }

  return NextResponse.json({ success: true, userId: newUser.user?.id })
}

// PATCH /api/admin/users — update a user's profile and/or auth fields
export async function PATCH(request: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId, role, full_name, email, new_password, slack_member_id } = await request.json()

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  if (role && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const admin = createAdminClient()

  const profilePatch: Record<string, string | null> = {}
  if (role) profilePatch.role = role
  if (full_name !== undefined) profilePatch.full_name = full_name?.trim() || null
  if (slack_member_id !== undefined) profilePatch.slack_member_id = slack_member_id?.trim() || null

  if (Object.keys(profilePatch).length > 0) {
    const { error } = await admin.from('profiles').update(profilePatch).eq('id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const authPatch: { email?: string; password?: string } = {}
  if (email?.trim()) authPatch.email = email.trim()
  if (new_password?.trim()) authPatch.password = new_password.trim()

  if (Object.keys(authPatch).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(userId, authPatch)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

// DELETE /api/admin/users?userId=<id> — permanently delete a user
export async function DELETE(request: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const userId = request.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  if (userId === caller.id) return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
