import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PartnersInitialData, PartnerPageRow } from '@/lib/partner-types'
import PartnersClient from './PartnersClient'

export default async function PartnersPage() {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: configData } = await admin
    .from('partner_health_config')
    .select('stale_days')
    .limit(1)
    .single()

  const staleDays = configData?.stale_days ?? 30

  const [
    { data: { user } },
    { data: rpcData },
    { data: profilesData },
    { data: accountsData },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('get_partners_page'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
    supabase.from('accounts').select('id, account_name').order('account_name'),
  ])

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id ?? '')
    .single()

  const initialData: PartnersInitialData = {
    partners:        (rpcData ?? []) as PartnerPageRow[],
    profiles:        profilesData ?? [],
    accounts:        accountsData ?? [],
    currentUserId:   user?.id ?? '',
    currentUserRole: (currentProfile as { role: string } | null)?.role ?? '',
    staleDays,
  }

  return <PartnersClient initialData={initialData} />
}
