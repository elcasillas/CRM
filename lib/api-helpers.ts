import { createClient } from '@/lib/supabase/server'

/** Returns the authenticated user if they have role='admin', else null. */
export async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return (profile as { role: string } | null)?.role === 'admin' ? user : null
}

/**
 * Returns the authenticated user if they may run cross-user AI reporting,
 * which is admins and sales managers. Used by the per-salesperson follow-up
 * route so authorisation stays server side rather than a UI condition.
 */
export async function assertManagerOrAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role: string } | null)?.role
  return role === 'admin' || role === 'sales_manager' ? user : null
}
