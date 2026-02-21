import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UsersClient } from './users-client'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()
  const [{ data: profilesData }, { data: authData }] = await Promise.all([
    admin.from('profiles').select('id, full_name, role, created_at').order('created_at', { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const authEmailMap = new Map((authData?.users ?? []).map(u => [u.id, u.email]))
  const users = (profilesData ?? []).map(p => ({
    ...p,
    email: authEmailMap.get(p.id) ?? null,
  }))

  return <UsersClient users={users} currentUserId={user.id} />
}
