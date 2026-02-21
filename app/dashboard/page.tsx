import { createClient } from '@/lib/supabase/server'
import type { DealStage, DealWithRelations } from '@/lib/types'
import { StatCard }          from '@/components/dashboard/stat-card'
import { DealsByStage }      from '@/components/dashboard/deals-by-stage'
import { ContractsRenewing } from '@/components/dashboard/contracts-renewing'
import { RecentActivity }    from '@/components/dashboard/recent-activity'
import type { DealStageRow } from '@/components/dashboard/deals-by-stage'
import type { ContractRow }  from '@/components/dashboard/contracts-renewing'

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${v.toFixed(0)}`
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)
  const todayStr = todayMidnight.toISOString().split('T')[0]
  const in90Str  = new Date(todayMidnight.getTime() + 90 * 86400000).toISOString().split('T')[0]

  const [accountsRes, dealsRes, contactsRes, stagesRes, contractsRes] = await Promise.all([
    supabase.from('accounts').select('id, status'),
    supabase
      .from('deals')
      .select('id, deal_name, value_amount, last_activity_at, stage_id, account_id, accounts(account_name), deal_stages(stage_name, sort_order, is_closed, is_won, is_lost)')
      .order('last_activity_at', { ascending: false, nullsFirst: false }),
    supabase.from('contacts').select('id', { count: 'exact', head: true }),
    supabase.from('deal_stages').select('id, stage_name, sort_order, is_closed, is_won, is_lost').order('sort_order'),
    supabase
      .from('contracts')
      .select('id, renewal_date, account_id, accounts(account_name)')
      .eq('status', 'active')
      .gte('renewal_date', todayStr)
      .lte('renewal_date', in90Str)
      .order('renewal_date'),
  ])

  const accounts = accountsRes.data ?? []
  const deals    = (dealsRes.data ?? []) as unknown as DealWithRelations[]
  const contacts = contactsRes.count ?? 0
  const stages   = (stagesRes.data ?? []) as DealStage[]

  // ── Stat card values ──────────────────────────────────────────────────────
  const active   = accounts.filter(a => a.status === 'active').length
  const inactive = accounts.filter(a => a.status === 'inactive').length
  const churned  = accounts.filter(a => a.status === 'churned').length

  const openDeals   = deals.filter(d => !d.deal_stages?.is_closed)
  const wonDeals    = deals.filter(d => d.deal_stages?.is_won)
  const pipelineVal = openDeals.reduce((s, d) => s + (d.value_amount ?? 0), 0)

  const accountSub = [
    inactive && `${inactive} inactive`,
    churned  && `${churned} churned`,
  ].filter(Boolean).join(' · ') || 'all accounts active'

  // ── Deals by stage (all stages, including closed) ─────────────────────────
  const dealsByStageid = new Map<string, { count: number; value: number }>()
  for (const deal of deals) {
    const cur = dealsByStageid.get(deal.stage_id) ?? { count: 0, value: 0 }
    cur.count++
    cur.value += deal.value_amount ?? 0
    dealsByStageid.set(deal.stage_id, cur)
  }

  const stageRows: DealStageRow[] = stages.map(s => ({
    id:         s.id,
    stage_name: s.stage_name,
    is_won:     s.is_won,
    is_lost:    s.is_lost,
    count:      dealsByStageid.get(s.id)?.count ?? 0,
    value:      dealsByStageid.get(s.id)?.value ?? 0,
  }))

  // ── Contracts renewing in next 90 days ────────────────────────────────────
  const contractRows: ContractRow[] = (contractsRes.data ?? []).map(c => {
    const acct    = c.accounts as unknown as { account_name: string } | null
    const renewal = new Date(c.renewal_date + 'T00:00:00')
    const days    = Math.max(
      Math.ceil((renewal.getTime() - todayMidnight.getTime()) / 86400000),
      0,
    )
    return {
      id:           c.id,
      account_name: acct?.account_name ?? null,
      renewal_date: c.renewal_date as string,
      days,
    }
  })

  // ── Recent activity ───────────────────────────────────────────────────────
  const recentDeals = deals.slice(0, 7)

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Overview</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Active Accounts"
          value={active}
          href="/dashboard/accounts"
          sub={accountSub}
        />
        <StatCard
          label="Open Deals"
          value={openDeals.length}
          href="/dashboard/deals"
          sub={wonDeals.length > 0 ? `${wonDeals.length} won all-time` : 'no closed-won yet'}
        />
        <StatCard
          label="Pipeline Value"
          value={pipelineVal > 0 ? fmt(pipelineVal) : '—'}
          href="/dashboard/deals"
          sub="across open deals"
        />
        <StatCard
          label="Contacts"
          value={contacts}
          sub="across all accounts"
        />
      </div>

      {/* Deals by stage — full-width */}
      <div className="mb-6">
        <DealsByStage rows={stageRows} />
      </div>

      {/* Contracts renewing + Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          <ContractsRenewing rows={contractRows} />
        </div>
        <div className="lg:col-span-3">
          <RecentActivity deals={recentDeals} />
        </div>
      </div>
    </div>
  )
}
