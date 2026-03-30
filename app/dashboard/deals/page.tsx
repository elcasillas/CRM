import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DealWithRelations, DealStage, Account } from '@/lib/types'
import type { DealsInitialData, DealPageRow } from './types'
import DealsClient from './DealsClient'

export default async function DealsPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  // Fetch config first so we can pass stale_days to the RPC
  const { data: configData } = await admin
    .from('health_score_config')
    .select('stale_days, new_deal_days')
    .limit(1)
    .single()

  const staleDays    = configData?.stale_days    ?? 30
  const newDealDaysRaw = Number(configData?.new_deal_days)
  const newDealDays    = isFinite(newDealDaysRaw) && newDealDaysRaw > 0 ? Math.round(newDealDaysRaw) : 14

  const [
    { data: { user } },
    { data: rpcData },
    { data: stagesData },
    { data: accountsData },
    { data: profilesData },
    { data: authData },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('get_deals_page', { p_stale_days: staleDays, p_active_only: true }),
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
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  // Map flat RPC rows → DealWithRelations[] and build lastNoteDates
  const rpcRows = (rpcData ?? []) as DealPageRow[]

  const deals = rpcRows.map(row => ({
    id:                    row.id,
    deal_name:             row.deal_name,
    deal_description:      row.deal_description,
    account_id:            row.account_id,
    stage_id:              row.stage_id,
    deal_owner_id:         row.deal_owner_id,
    solutions_engineer_id: row.solutions_engineer_id,
    amount:                row.amount,
    contract_term_months:  row.contract_term_months,
    total_contract_value:  row.total_contract_value,
    value_amount:          row.value_amount,
    currency:              row.currency,
    close_date:            row.close_date,
    region:                row.region,
    deal_type:             row.deal_type,
    last_activity_at:      row.last_activity_at,
    created_at:            row.created_at,
    updated_at:            row.updated_at,
    health_score:          row.health_score,
    hs_stage_probability:  row.hs_stage_probability,
    hs_velocity:           row.hs_velocity,
    hs_activity_recency:   row.hs_activity_recency,
    hs_close_date:         row.hs_close_date,
    hs_acv:                row.hs_acv,
    hs_notes_signal:       row.hs_notes_signal,
    health_debug:          row.health_debug,
    notes_hash:            row.notes_hash,
    accounts:              row.account_name ? { account_name: row.account_name } : null,
    deal_stages:           row.stage_name ? {
      stage_name:  row.stage_name,
      sort_order:  row.stage_sort_order!,
      is_closed:   row.stage_is_closed!,
      is_won:      row.stage_is_won!,
      is_lost:     row.stage_is_lost!,
    } : null,
    deal_owner:            row.deal_owner_name ? { full_name: row.deal_owner_name } : null,
    solutions_engineer:    row.se_name         ? { full_name: row.se_name }         : null,
  })) as DealWithRelations[]

  const lastNoteDates: Record<string, string> = {}
  for (const row of rpcRows) {
    if (row.last_note_at) lastNoteDates[row.id] = row.last_note_at
  }

  // Build emailMap
  const emailMap: Record<string, string> = {}
  for (const u of authData?.users ?? []) {
    emailMap[u.id] = u.email ?? ''
  }

  const currentUserProfile = (profilesData ?? []).find(p => p.id === user?.id)

  const initialData: DealsInitialData = {
    deals,
    stages:          (stagesData ?? []) as DealStage[],
    accounts:        (accountsData ?? []) as Pick<Account, 'id' | 'account_name'>[],
    profiles:        profilesData ?? [],
    lastNoteDates,
    emailMap,
    staleDays,
    newDealDays,
    currentUserId:   user?.id ?? '',
    currentUserRole: currentUserProfile?.role ?? '',
  }

  return (
    <Suspense>
      <DealsClient initialData={initialData} />
    </Suspense>
  )
}
