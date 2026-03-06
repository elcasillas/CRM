import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminUsersClient } from './users-client'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if ((profile as { role: string } | null)?.role !== 'admin') redirect('/dashboard')

  return <AdminUsersClient />
}
