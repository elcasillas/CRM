import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { DealWithRelations } from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${v.toFixed(0)}`
}

function relative(ts: string | null): string {
  if (!ts) return '—'
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30)  return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()

  const [accountsRes, dealsRes, contactsRes] = await Promise.all([
    supabase.from('accounts').select('id, status'),
    supabase
      .from('deals')
      .select('id, deal_name, value_amount, last_activity_at, stage_id, account_id, accounts(account_name), deal_stages(stage_name, sort_order, is_closed, is_won, is_lost)')
      .order('last_activity_at', { ascending: false, nullsFirst: false }),
    supabase.from('contacts').select('id', { count: 'exact', head: true }),
  ])

  const accounts = accountsRes.data ?? []
  const deals    = (dealsRes.data ?? []) as unknown as DealWithRelations[]
  const contacts = contactsRes.count ?? 0

  const active  = accounts.filter(a => a.status === 'active').length
  const inactive = accounts.filter(a => a.status === 'inactive').length
  const churned  = accounts.filter(a => a.status === 'churned').length

  const openDeals    = deals.filter(d => !d.deal_stages?.is_closed)
  const wonDeals     = deals.filter(d => d.deal_stages?.is_won)
  const pipelineVal  = openDeals.reduce((s: number, d) => s + (d.value_amount ?? 0), 0)

  // Pipeline breakdown — open deals grouped by stage
  type StageRow = { name: string; sort_order: number; count: number; value: number }
  const stageMap = new Map<string, StageRow>()
  for (const deal of openDeals) {
    const s = deal.deal_stages
    if (!s) continue
    if (!stageMap.has(deal.stage_id)) {
      stageMap.set(deal.stage_id, { name: s.stage_name, sort_order: s.sort_order, count: 0, value: 0 })
    }
    const row = stageMap.get(deal.stage_id)!
    row.count++
    row.value += deal.value_amount ?? 0
  }
  const stageRows = [...stageMap.values()].sort((a, b) => a.sort_order - b.sort_order)
  const maxVal    = Math.max(...stageRows.map(r => r.value), 1)

  // Recent activity — last 7 deals
  const recent = deals.slice(0, 7)

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Overview</h1>

      {/* ── Stat cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">

        <Link href="/dashboard/accounts" className="group bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:border-blue-300 transition-colors">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Active Accounts</p>
          <p className="text-3xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{active}</p>
          <p className="text-xs text-gray-400 mt-1.5">
            {inactive > 0 && `${inactive} inactive`}
            {inactive > 0 && churned > 0 && ' · '}
            {churned > 0 && `${churned} churned`}
            {inactive === 0 && churned === 0 && 'all accounts active'}
          </p>
        </Link>

        <Link href="/dashboard/deals" className="group bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:border-blue-300 transition-colors">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Open Deals</p>
          <p className="text-3xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{openDeals.length}</p>
          <p className="text-xs text-gray-400 mt-1.5">
            {wonDeals.length > 0 ? `${wonDeals.length} won all-time` : 'no closed-won yet'}
          </p>
        </Link>

        <Link href="/dashboard/deals" className="group bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:border-blue-300 transition-colors">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Pipeline Value</p>
          <p className="text-3xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
            {pipelineVal > 0 ? fmt(pipelineVal) : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1.5">across open deals</p>
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Contacts</p>
          <p className="text-3xl font-bold text-gray-900">{contacts}</p>
          <p className="text-xs text-gray-400 mt-1.5">across all accounts</p>
        </div>

      </div>

      {/* ── Lower panels ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Pipeline by stage */}
        <div className="lg:col-span-3 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Open Pipeline by Stage</h2>
            <Link href="/dashboard/deals" className="text-xs text-blue-600 hover:text-blue-700">View all →</Link>
          </div>

          {stageRows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">No open deals yet.</p>
          ) : (
            <>
              {/* Column headers */}
              <div className="px-5 py-2 flex items-center gap-4 border-b border-gray-50">
                <span className="w-36 flex-shrink-0 text-xs text-gray-400">Stage</span>
                <span className="flex-1 text-xs text-gray-400">Value</span>
                <span className="w-16 text-right text-xs text-gray-400 flex-shrink-0">Amount</span>
                <span className="w-8 text-right text-xs text-gray-400 flex-shrink-0">Deals</span>
              </div>
              <div className="divide-y divide-gray-50">
                {stageRows.map(row => (
                  <div key={row.name} className="px-5 py-3 flex items-center gap-4">
                    <p className="w-36 flex-shrink-0 text-sm text-gray-700 truncate">{row.name}</p>
                    <div className="flex-1 min-w-0">
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${Math.max((row.value / maxVal) * 100, row.value > 0 ? 2 : 0)}%` }}
                        />
                      </div>
                    </div>
                    <p className="w-16 text-right flex-shrink-0 text-sm font-medium text-gray-900">
                      {row.value > 0 ? fmt(row.value) : '—'}
                    </p>
                    <p className="w-8 text-right flex-shrink-0 text-xs text-gray-400">{row.count}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Recent activity */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Deal Activity</h2>
            <Link href="/dashboard/deals" className="text-xs text-blue-600 hover:text-blue-700">View all →</Link>
          </div>

          {recent.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">No deals yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {recent.map((deal) => {
                const s = deal.deal_stages
                const badgeClass = !s
                  ? 'bg-gray-100 text-gray-600'
                  : s.is_lost ? 'bg-red-50 text-red-600'
                  : s.is_won  ? 'bg-green-50 text-green-700'
                  : s.sort_order <= 3 ? 'bg-gray-100 text-gray-700'
                  : s.sort_order <= 5 ? 'bg-amber-50 text-amber-700'
                  : 'bg-orange-50 text-orange-700'

                return (
                  <div key={deal.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{deal.deal_name}</p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {deal.accounts?.account_name ?? '—'}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400">{relative(deal.last_activity_at)}</p>
                        {deal.value_amount != null && (
                          <p className="text-xs font-medium text-gray-700 mt-0.5">{fmt(deal.value_amount)}</p>
                        )}
                      </div>
                    </div>
                    {s && (
                      <span className={`inline-flex mt-1.5 text-xs font-medium px-1.5 py-0.5 rounded ${badgeClass}`}>
                        {s.stage_name}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
