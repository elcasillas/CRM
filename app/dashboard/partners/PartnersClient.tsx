'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { PartnerRow, ImportLogRow } from './page'

// ── Helpers ───────────────────────────────────────────────────────────────────

function healthBg(status: string | null) {
  switch (status) {
    case 'healthy':           return 'bg-green-100 text-green-700'
    case 'at_risk':           return 'bg-amber-100 text-amber-700'
    case 'critical':          return 'bg-red-100 text-red-600'
    case 'insufficient_data': return 'bg-gray-100 text-gray-400'
    default:                  return 'bg-gray-100 text-gray-400'
  }
}

function healthLabel(status: string | null) {
  switch (status) {
    case 'healthy':           return 'Healthy'
    case 'at_risk':           return 'At Risk'
    case 'critical':          return 'Critical'
    case 'insufficient_data': return 'No Data'
    default:                  return '—'
  }
}

function scoreBg(score: number | null) {
  if (score == null) return 'bg-gray-100 text-gray-400'
  if (score >= 75)   return 'bg-green-100 text-green-700'
  if (score >= 50)   return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-600'
}

function tierLabel(t: string) {
  switch (t) {
    case 'enterprise': return 'Enterprise'
    case 'tier1':      return 'Tier 1'
    case 'tier2':      return 'Tier 2'
    case 'tier3':      return 'Tier 3'
    default:           return t
  }
}

function statusDot(s: string) {
  switch (s) {
    case 'active':     return 'bg-green-500'
    case 'at_risk':    return 'bg-amber-400'
    case 'churned':    return 'bg-red-400'
    case 'onboarding': return 'bg-blue-400'
    default:           return 'bg-gray-300'
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDelta(d: number | null) {
  if (d == null) return null
  const sign = d > 0 ? '+' : ''
  return `${sign}${Math.round(d)}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PartnersClient({
  initialPartners,
  lastImport,
}: {
  initialPartners: PartnerRow[]
  lastImport:      ImportLogRow | null
}) {
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTier,   setFilterTier]   = useState('')
  const [sortCol,      setSortCol]      = useState('overall_score')
  const [sortDir,      setSortDir]      = useState<'asc' | 'desc'>('desc')

  function toggleSort(col: string) {
    setSortCol(col)
    setSortDir(prev => sortCol === col ? (prev === 'asc' ? 'desc' : 'asc') : 'desc')
  }

  const statuses = useMemo(() => [...new Set(initialPartners.map(p => p.status))].sort(), [initialPartners])
  const tiers    = useMemo(() => [...new Set(initialPartners.map(p => p.tier))].sort(), [initialPartners])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return initialPartners.filter(p => {
      const matchSearch = !q || p.partner_name.toLowerCase().includes(q) || (p.account_manager_name ?? '').toLowerCase().includes(q)
      const matchStatus = !filterStatus || p.status === filterStatus
      const matchTier   = !filterTier   || p.tier === filterTier
      return matchSearch && matchStatus && matchTier
    })
  }, [initialPartners, search, filterStatus, filterTier])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va: string | number | null = null
      let vb: string | number | null = null
      switch (sortCol) {
        case 'partner_name':  va = a.partner_name;  vb = b.partner_name;  break
        case 'tier':          va = a.tier;           vb = b.tier;           break
        case 'status':        va = a.status;         vb = b.status;         break
        case 'overall_score': va = a.overall_score;  vb = b.overall_score;  break
        case 'risk_score':    va = a.risk_score;     vb = b.risk_score;     break
        case 'growth_score':  va = a.growth_score;   vb = b.growth_score;   break
        case 'delta':         va = a.score_delta_3mo; vb = b.score_delta_3mo; break
        case 'alerts':        va = a.active_alert_count; vb = b.active_alert_count; break
      }
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      const r = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sortDir === 'asc' ? r : -r
    })
  }, [filtered, sortCol, sortDir])

  // Summary cards
  const total    = filtered.length
  const healthy  = filtered.filter(p => p.health_status === 'healthy').length
  const atRisk   = filtered.filter(p => p.health_status === 'at_risk').length
  const critical = filtered.filter(p => p.health_status === 'critical').length
  const avgScore = filtered.length
    ? Math.round(filtered.filter(p => p.overall_score != null).reduce((s, p) => s + (p.overall_score ?? 0), 0) / Math.max(filtered.filter(p => p.overall_score != null).length, 1))
    : null

  function Th({ col, label }: { col: string; label: string }) {
    const active = sortCol === col
    return (
      <th
        onClick={() => toggleSort(col)}
        className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 text-left whitespace-nowrap"
      >
        {label}
        <span className={`ml-1 ${active ? 'text-gray-700' : 'text-gray-300'}`}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </th>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Partner Health</h2>
        <div className="flex items-center gap-3">
          <a
            href="/api/partners/import/template"
            className="text-sm text-[#00ADB1] hover:text-[#00989C] font-medium border border-[#00ADB1] bg-[#E6F7F8] hover:bg-[#D2F0F2] px-3 py-2 rounded-lg transition-colors"
          >
            Download Template
          </a>
          <Link
            href="/dashboard/partners/import"
            className="bg-[#00ADB1] hover:bg-[#00989C] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Import CSV
          </Link>
        </div>
      </div>

      {/* Last import info */}
      {lastImport && (
        <div className={`mb-4 flex items-center gap-3 text-xs px-4 py-2.5 rounded-lg border ${
          lastImport.status === 'failed'  ? 'bg-red-50 border-red-200 text-red-700' :
          lastImport.status === 'partial' ? 'bg-amber-50 border-amber-200 text-amber-700' :
          'bg-green-50 border-green-200 text-green-700'
        }`}>
          <span className="font-medium">
            Last import: {fmtDate(lastImport.imported_at)}
          </span>
          <span>·</span>
          <span>{lastImport.partner_count} partner{lastImport.partner_count !== 1 ? 's' : ''} updated</span>
          <span>·</span>
          <span>{lastImport.row_count} rows</span>
          {lastImport.skipped_count > 0 && <><span>·</span><span>{lastImport.skipped_count} skipped</span></>}
          {lastImport.error_count   > 0 && <><span>·</span><span>{lastImport.error_count} errors</span></>}
          {lastImport.message && <><span>·</span><span className="truncate max-w-xs">{lastImport.message}</span></>}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Total Partners', value: total,    color: 'text-gray-900' },
          { label: 'Healthy',        value: healthy,  color: 'text-green-700' },
          { label: 'At Risk',        value: atRisk,   color: 'text-amber-600' },
          { label: 'Critical',       value: critical, color: 'text-red-600' },
          { label: 'Avg Health Score', value: avgScore ?? '—', color: 'text-gray-900' },
        ].map(c => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search partners…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20 w-56"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20"
        >
          <option value="">All statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterTier}
          onChange={e => setFilterTier(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20"
        >
          <option value="">All tiers</option>
          {tiers.map(t => <option key={t} value={t}>{tierLabel(t)}</option>)}
        </select>
        {(search || filterStatus || filterTier) && (
          <button
            onClick={() => { setSearch(''); setFilterStatus(''); setFilterTier('') }}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
        {(search || filterStatus || filterTier) && (
          <span className="text-sm text-gray-400">{filtered.length} of {initialPartners.length}</span>
        )}
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {initialPartners.length === 0
            ? 'No partners yet. Import a CSV to get started.'
            : 'No partners match your filters.'}
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <Th col="partner_name" label="Partner" />
                <Th col="tier"         label="Tier" />
                <Th col="status"       label="Status" />
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Region</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Owner</th>
                <Th col="overall_score" label="Health" />
                <Th col="risk_score"    label="Risk" />
                <Th col="growth_score"  label="Growth" />
                <Th col="delta"         label="Δ 3mo" />
                <Th col="alerts"        label="Alerts" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(p => {
                const delta     = fmtDelta(p.score_delta_3mo)
                const deltaPos  = p.score_delta_3mo != null && p.score_delta_3mo > 0
                const deltaNeg  = p.score_delta_3mo != null && p.score_delta_3mo < 0
                return (
                  <tr key={p.id} className="hover:bg-[#E6F7F8] transition-colors">

                    {/* Partner name */}
                    <td className="px-4 py-3.5 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(p.status)}`} />
                        {p.partner_name}
                      </div>
                    </td>

                    {/* Tier */}
                    <td className="px-4 py-3.5 text-gray-500 text-xs">{tierLabel(p.tier)}</td>

                    {/* Status */}
                    <td className="px-4 py-3.5 text-xs capitalize text-gray-600">{p.status.replace(/_/g, ' ')}</td>

                    {/* Region */}
                    <td className="px-4 py-3.5 text-gray-500 text-xs">{p.region ?? '—'}</td>

                    {/* Owner */}
                    <td className="px-4 py-3.5 text-gray-500">{p.account_manager_name ?? '—'}</td>

                    {/* Health score + status */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        {p.overall_score != null && (
                          <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold ${scoreBg(p.overall_score)}`}>
                            {p.overall_score}
                          </span>
                        )}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${healthBg(p.health_status)}`}>
                          {healthLabel(p.health_status)}
                        </span>
                      </div>
                    </td>

                    {/* Risk */}
                    <td className="px-4 py-3.5">
                      {p.risk_score != null
                        ? <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold ${scoreBg(100 - p.risk_score)}`}>{p.risk_score}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>

                    {/* Growth */}
                    <td className="px-4 py-3.5">
                      {p.growth_score != null
                        ? <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold ${scoreBg(p.growth_score)}`}>{p.growth_score}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>

                    {/* Delta 3mo */}
                    <td className="px-4 py-3.5 text-xs font-medium">
                      {delta
                        ? <span className={deltaPos ? 'text-green-600' : deltaNeg ? 'text-red-500' : 'text-gray-400'}>{delta}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Alerts */}
                    <td className="px-4 py-3.5">
                      {p.active_alert_count > 0 ? (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          p.top_alert_severity === 'critical' ? 'bg-red-100 text-red-600' :
                          p.top_alert_severity === 'warning'  ? 'bg-amber-100 text-amber-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {p.active_alert_count} alert{p.active_alert_count !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
