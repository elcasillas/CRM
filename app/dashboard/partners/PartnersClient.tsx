'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { AccountWithOwners } from '@/lib/types'

const supabase = createClient()

// ── Types ─────────────────────────────────────────────────────────────────────

interface DealRow {
  account_id:       string
  health_score:     number | null
  last_activity_at: string | null
  deal_stages:      { is_closed: boolean }[] | null
}

interface AHIRow extends AccountWithOwners {
  deal_count:        number
  active_deal_count: number
  avg_health_score:  number | null
  ahi_last_activity: string | null
}

type SortKey = 'account_name' | 'avg_health_score' | 'deal_count' | 'active_deal_count' | 'ahi_last_activity' | 'owner'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CLASSES: Record<string, string> = {
  active:   'bg-green-50 text-green-700 ring-1 ring-green-200',
  inactive: 'bg-gray-100 text-gray-600',
  churned:  'bg-red-50 text-red-600 ring-1 ring-red-200',
  prospect: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
}

function scoreBadgeClass(score: number | null): string {
  if (score == null) return 'bg-gray-100 text-gray-400'
  if (score >= 70)   return 'bg-green-100 text-green-700'
  if (score >= 40)   return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

function scoreLabel(score: number | null): string {
  if (score == null) return 'No active deals'
  if (score >= 70)   return 'Healthy'
  if (score >= 40)   return 'At Risk'
  return 'Critical'
}

function scoreLabelClass(score: number | null): string {
  if (score == null) return 'text-gray-400'
  if (score >= 70)   return 'text-green-600'
  if (score >= 40)   return 'text-yellow-600'
  return 'text-red-600'
}

function relDays(iso: string | null): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AHIClient() {
  const [rows, setRows]       = useState<AHIRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('avg_health_score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [{ data: accountsData }, { data: dealsData }] = await Promise.all([
      supabase
        .from('accounts')
        .select('*, account_owner:profiles!account_owner_id(id, full_name, email), service_manager:profiles!service_manager_id(id, full_name, email)')
        .order('account_name'),
      supabase
        .from('deals')
        .select('account_id, health_score, last_activity_at, deal_stages!stage_id(is_closed)'),
    ])

    const accounts = (accountsData ?? []) as AccountWithOwners[]
    const deals    = (dealsData    ?? []) as DealRow[]

    // Group deals by account
    const byAccount: Record<string, DealRow[]> = {}
    for (const d of deals) {
      if (!byAccount[d.account_id]) byAccount[d.account_id] = []
      byAccount[d.account_id].push(d)
    }

    // Build AHI rows — aggregate health score from active deals only
    const ahiRows: AHIRow[] = accounts.map(a => {
      const accountDeals  = byAccount[a.id] ?? []
      const activeDeals   = accountDeals.filter(d => !d.deal_stages?.[0]?.is_closed)
      const scores        = activeDeals.map(d => d.health_score).filter((s): s is number => s != null)
      const avgScore      = scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
        : null

      const dealLatest = accountDeals
        .map(d => d.last_activity_at)
        .filter((t): t is string => t != null)
        .sort()
        .at(-1) ?? null

      const lastActivity = [dealLatest, a.last_activity_at]
        .filter((t): t is string => t != null)
        .sort()
        .at(-1) ?? null

      return {
        ...a,
        deal_count:        accountDeals.length,
        active_deal_count: activeDeals.length,
        avg_health_score:  avgScore,
        ahi_last_activity: lastActivity,
      }
    })

    setRows(ahiRows)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || r.account_name.toLowerCase().includes(q)
      || (r.account_owner?.full_name ?? '').toLowerCase().includes(q)
    const matchStatus = !filterStatus || r.status === filterStatus
    return matchSearch && matchStatus
  })

  // ── Sort ────────────────────────────────────────────────────────────────────
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'avg_health_score' || key === 'deal_count' || key === 'active_deal_count' ? 'desc' : 'asc') }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-brand-600 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    switch (sortKey) {
      case 'avg_health_score':  return ((a.avg_health_score ?? -1) - (b.avg_health_score ?? -1)) * dir
      case 'deal_count':        return (a.deal_count - b.deal_count) * dir
      case 'active_deal_count': return (a.active_deal_count - b.active_deal_count) * dir
      case 'ahi_last_activity': return ((a.ahi_last_activity ?? '') < (b.ahi_last_activity ?? '') ? -1 : 1) * dir
      case 'owner':             return ((a.account_owner?.full_name ?? '') < (b.account_owner?.full_name ?? '') ? -1 : 1) * dir
      default:                  return a.account_name.localeCompare(b.account_name) * dir
    }
  })

  // ── Summary stats ───────────────────────────────────────────────────────────
  const healthyCount  = rows.filter(r => (r.avg_health_score ?? -1) >= 70).length
  const atRiskCount   = rows.filter(r => { const s = r.avg_health_score; return s != null && s >= 40 && s < 70 }).length
  const criticalCount = rows.filter(r => r.avg_health_score != null && r.avg_health_score < 40).length

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Account Health Index</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Aggregated deal health scores across all accounts
        </p>
      </div>

      {/* Summary cards */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Accounts</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{rows.length}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Healthy</p>
            <p className="text-2xl font-semibold text-green-700 mt-1">{healthyCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">score ≥ 70</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            <p className="text-xs font-medium text-yellow-600 uppercase tracking-wide">At Risk</p>
            <p className="text-2xl font-semibold text-yellow-700 mt-1">{atRiskCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">score 40–69</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Critical</p>
            <p className="text-2xl font-semibold text-red-700 mt-1">{criticalCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">score &lt; 40</p>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search accounts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100 w-64"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="churned">Churned</option>
          <option value="prospect">Prospect</option>
        </select>
        {(search || filterStatus) && (
          <button
            onClick={() => { setSearch(''); setFilterStatus('') }}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
        {!loading && (search || filterStatus) && (
          <span className="text-sm text-gray-400">{filtered.length} of {rows.length}</span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500 text-sm">No accounts found.</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-sm">No accounts match your filters.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th
                  onClick={() => toggleSort('account_name')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
                >
                  Account {sortIcon('account_name')}
                </th>
                <th
                  onClick={() => toggleSort('avg_health_score')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
                >
                  Health Score {sortIcon('avg_health_score')}
                </th>
                <th
                  onClick={() => toggleSort('deal_count')}
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
                >
                  Deals {sortIcon('deal_count')}
                </th>
                <th
                  onClick={() => toggleSort('active_deal_count')}
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
                >
                  Active {sortIcon('active_deal_count')}
                </th>
                <th
                  onClick={() => toggleSort('ahi_last_activity')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
                >
                  Last Activity {sortIcon('ahi_last_activity')}
                </th>
                <th
                  onClick={() => toggleSort('owner')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
                >
                  Owner {sortIcon('owner')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">

                  {/* Account */}
                  <td className="px-6 py-3.5">
                    <Link
                      href={`/dashboard/accounts/${r.id}`}
                      className="font-medium text-gray-900 hover:text-brand-600 transition-colors"
                    >
                      {r.account_name}
                    </Link>
                  </td>

                  {/* Health Score */}
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold ${scoreBadgeClass(r.avg_health_score)}`}>
                        {r.avg_health_score ?? '—'}
                      </span>
                      <span className={`text-xs font-medium ${scoreLabelClass(r.avg_health_score)}`}>
                        {scoreLabel(r.avg_health_score)}
                      </span>
                    </div>
                  </td>

                  {/* Deal Count */}
                  <td className="px-6 py-3.5 text-center text-gray-600">
                    {r.deal_count > 0 ? r.deal_count : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Active Deals */}
                  <td className="px-6 py-3.5 text-center">
                    {r.active_deal_count > 0 ? (
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700">
                        {r.active_deal_count}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* Last Activity */}
                  <td className="px-6 py-3.5 text-gray-500 text-sm">
                    {relDays(r.ahi_last_activity)}
                  </td>

                  {/* Owner */}
                  <td className="px-6 py-3.5 text-gray-500">
                    {r.account_owner?.full_name ?? '—'}
                  </td>

                  {/* Status */}
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_CLASSES[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </span>
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
