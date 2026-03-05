import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DealWithRelations, DealStage, Account } from '@/lib/types'
import type { DealsInitialData } from './types'
import DealsClient from './DealsClient'

export default async function DealsPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const [
    { data: { user } },
    { data: dealsData },
    { data: stagesData },
    { data: accountsData },
    { data: profilesData },
    { data: notesData },
    { data: authData },
    { data: configData },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('deals')
      .select('*, accounts(account_name), deal_stages(stage_name, sort_order, is_closed, is_won, is_lost), deal_owner:profiles!deal_owner_id(full_name), solutions_engineer:profiles!solutions_engineer_id(full_name)')
      .order('last_activity_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('deal_stages')
      .select('id, stage_name, sort_order, is_closed, is_won, is_lost, win_probability')
      .order('sort_order'),
    supabase
      .from('accounts')
      .select('id, account_name')
      .order('account_name'),
    supabase
      .from('profiles')
      .select('id, full_name, role, slack_member_id')
      .order('full_name'),
    supabase
      .from('notes')
      .select('entity_id, created_at')
      .eq('entity_type', 'deal')
      .order('created_at', { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from('health_score_config').select('stale_days').limit(1).single(),
  ])

  // Build lastNoteDates — first entry per deal is most recent (ordered desc)
  const lastNoteDates: Record<string, string> = {}
  for (const n of notesData ?? []) {
    if (!lastNoteDates[n.entity_id]) lastNoteDates[n.entity_id] = n.created_at
  }

  // Build emailMap
  const emailMap: Record<string, string> = {}
  for (const u of authData?.users ?? []) {
    emailMap[u.id] = u.email ?? ''
  }

  const currentUserProfile = (profilesData ?? []).find(p => p.id === user?.id)

  const initialData: DealsInitialData = {
    deals:           (dealsData  ?? []) as DealWithRelations[],
    stages:          (stagesData ?? []) as DealStage[],
    accounts:        (accountsData ?? []) as Pick<Account, 'id' | 'account_name'>[],
    profiles:        profilesData ?? [],
    lastNoteDates,
    emailMap,
    staleDays:       configData?.stale_days ?? 30,
    currentUserId:   user?.id ?? '',
    currentUserRole: currentUserProfile?.role ?? '',
  }

  return <DealsClient initialData={initialData} />
}
