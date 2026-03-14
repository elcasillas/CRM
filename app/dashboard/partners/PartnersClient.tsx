'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { PartnersInitialData, PartnerPageRow, PartnerFormData, PartnerType, PartnerTier, PartnerStatus } from '@/lib/partner-types'
import {
  healthStatusLabel, healthStatusBadgeClass, scoreBadgeClass,
  scoreDeltaDisplay, relativeTime, tierBadgeClass, partnerStatusBadgeClass,
  PARTNER_TYPE_LABELS, PARTNER_TIER_LABELS, PARTNER_STATUS_LABELS,
  alertSeverityClass,
} from '@/lib/partner-health'

const EMPTY_FORM: PartnerFormData = {
  partner_name: '', partner_type: 'reseller', tier: 'tier2', status: 'active',
  account_id: '', account_manager_id: '', region: '', country: '', website: '', description: '',
}

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100 text-sm'
const SELECT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-500 text-sm'
const LABEL = 'block text-xs font-medium text-gray-600 mb-1'

type SortKey = 'account_name' | 'overall_score' | 'account_manager_name' | 'days_since_last_note'

interface FiltersState {
  search:       string
  filterStatus: string
  filterTier:   string
  filterType:   string
  filterOwner:  string
  sortKey:      SortKey
  sortDir:      'asc' | 'desc'
}

interface UIState {
  modal:    'add' | 'edit' | null
  editing:  PartnerPageRow | null
  form:     PartnerFormData
  saving:   boolean
  error:    string
  deleting: string | null
}

export default function PartnersClient({ initialData }: { initialData: PartnersInitialData }) {
  const { profiles, accounts, currentUserId, currentUserRole, staleDays } = initialData
  const supabase = createClient()

  const [partners, setPartners]   = useState<PartnerPageRow[]>(initialData.partners)
  const [filters,  setFiltersRaw] = useState<FiltersState>({
    search: '', filterStatus: '', filterTier: '', filterType: '', filterOwner: '',
    sortKey: 'overall_score', sortDir: 'desc',
  })
  const [ui, setUIRaw] = useState<UIState>({
    modal: null, editing: null, form: EMPTY_FORM, saving: false, error: '', deleting: null,
  })

  const isAdmin   = currentUserRole === 'admin'
  const isManager = currentUserRole === 'sales_manager'
  const canCreate = isAdmin || isManager

  function setFilter<K extends keyof FiltersState>(k: K, v: FiltersState[K]) {
    setFiltersRaw(prev => ({ ...prev, [k]: v }))
  }
  function setUI<K extends keyof UIState>(k: K, v: UIState[K]) {
    setUIRaw(prev => ({ ...prev, [k]: v }))
  }

  async function fetchPartners() {
    const { data } = await supabase.rpc('get_partners_page')
    if (data) setPartners(data as PartnerPageRow[])
  }

  // ── Filtering and sorting ──────────────────────────────────────────────────
  const filtered = partners
    .filter(p => {
      const s = filters.search.toLowerCase()
      if (s && !p.partner_name.toLowerCase().includes(s) && !(p.account_name ?? '').toLowerCase().includes(s)) return false
      if (filters.filterStatus && p.status !== filters.filterStatus) return false
      if (filters.filterTier   && p.tier   !== filters.filterTier)   return false
      if (filters.filterType   && p.partner_type !== filters.filterType) return false
      if (filters.filterOwner  && p.account_manager_id !== filters.filterOwner) return false
      return true
    })
    .sort((a, b) => {
      const dir = filters.sortDir === 'asc' ? 1 : -1
      if (filters.sortKey === 'overall_score') {
        return ((a.overall_score ?? -1) - (b.overall_score ?? -1)) * dir
      }
      if (filters.sortKey === 'days_since_last_note') {
        return ((a.days_since_last_note ?? 9999) - (b.days_since_last_note ?? 9999)) * dir
      }
      const av = String(a[filters.sortKey] ?? '')
      const bv = String(b[filters.sortKey] ?? '')
      return av.localeCompare(bv) * dir
    })

  function toggleSort(key: SortKey) {
    if (filters.sortKey === key) {
      setFilter('sortDir', filters.sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setFiltersRaw(prev => ({ ...prev, sortKey: key, sortDir: 'desc' }))
    }
  }

  function sortIcon(key: SortKey) {
    if (filters.sortKey !== key) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-brand-600 ml-1">{filters.sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────
  function openAdd() {
    setUIRaw(prev => ({
      ...prev, modal: 'add', editing: null,
      form: { ...EMPTY_FORM, account_manager_id: currentUserId },
      error: '',
    }))
  }

  function openEdit(p: PartnerPageRow) {
    setUIRaw(prev => ({
      ...prev, modal: 'edit', editing: p,
      form: {
        partner_name:       p.partner_name,
        partner_type:       p.partner_type,
        tier:               p.tier,
        status:             p.status,
        account_id:         p.account_id         ?? '',
        account_manager_id: p.account_manager_id ?? '',
        region:             p.region             ?? '',
        country:            p.country            ?? '',
        website:            p.website            ?? '',
        description:        p.description        ?? '',
      },
      error: '',
    }))
  }

  function closeModal() {
    setUIRaw(prev => ({ ...prev, modal: null, editing: null, form: EMPTY_FORM, error: '' }))
  }

  function setFormField(k: keyof PartnerFormData, v: string) {
    setUIRaw(prev => ({ ...prev, form: { ...prev.form, [k]: v } }))
  }

  async function handleSave() {
    if (!ui.form.partner_name.trim()) {
      setUI('error', 'Partner name is required')
      return
    }
    setUIRaw(prev => ({ ...prev, saving: true, error: '' }))

    const payload = {
      partner_name:       ui.form.partner_name.trim(),
      partner_type:       ui.form.partner_type,
      tier:               ui.form.tier,
      status:             ui.form.status,
      account_id:         ui.form.account_id         || null,
      account_manager_id: ui.form.account_manager_id || null,
      region:             ui.form.region             || null,
      country:            ui.form.country            || null,
      website:            ui.form.website            || null,
      description:        ui.form.description        || null,
    }

    const url    = ui.modal === 'add' ? '/api/partners' : `/api/partners/${ui.editing!.id}`
    const method = ui.modal === 'add' ? 'POST'          : 'PATCH'

    const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json()

    if (!res.ok) {
      setUIRaw(prev => ({ ...prev, saving: false, error: json.error ?? 'Failed to save' }))
      return
    }

    await fetchPartners()
    setUIRaw(prev => ({ ...prev, saving: false, modal: null, editing: null, form: EMPTY_FORM }))
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Partner Health Index</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} partner{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        {canCreate && (
          <button
            onClick={openAdd}
            className="bg-brand-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors"
          >
            + Add Partner
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Search partners…"
          value={filters.search}
          onChange={e => setFilter('search', e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-brand-500 w-56"
        />
        <select value={filters.filterStatus} onChange={e => setFilter('filterStatus', e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-brand-500">
          <option value="">All Statuses</option>
          {Object.entries(PARTNER_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.filterType} onChange={e => setFilter('filterType', e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-brand-500">
          <option value="">All Types</option>
          {Object.entries(PARTNER_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.filterTier} onChange={e => setFilter('filterTier', e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-brand-500">
          <option value="">All Tiers</option>
          {Object.entries(PARTNER_TIER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {isAdmin && (
          <select value={filters.filterOwner} onChange={e => setFilter('filterOwner', e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-brand-500">
            <option value="">All Owners</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</option>)}
          </select>
        )}
        {(filters.search || filters.filterStatus || filters.filterType || filters.filterTier || filters.filterOwner) && (
          <button
            onClick={() => setFiltersRaw(prev => ({ ...prev, search: '', filterStatus: '', filterTier: '', filterType: '', filterOwner: '' }))}
            className="text-sm text-gray-500 hover:text-gray-700 px-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer" onClick={() => toggleSort('account_name')}>
                  Partner {sortIcon('account_name')}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type / Tier</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 cursor-pointer" onClick={() => toggleSort('overall_score')}>
                  Score {sortIcon('overall_score')}
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Risk</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Growth</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer" onClick={() => toggleSort('account_manager_name')}>
                  Owner {sortIcon('account_manager_name')}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer" onClick={() => toggleSort('days_since_last_note')}>
                  Last Note {sortIcon('days_since_last_note')}
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Alerts</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    {partners.length === 0 ? 'No partners yet. Add your first partner to get started.' : 'No partners match the current filters.'}
                  </td>
                </tr>
              )}
              {filtered.map(p => {
                const delta = scoreDeltaDisplay(p.score_delta_3mo)
                return (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    {/* Partner / Account */}
                    <td className="px-4 py-3">
                      {p.account_id ? (
                        <Link
                          href={`/dashboard/accounts/${p.account_id}`}
                          className="font-medium text-brand-700 hover:text-brand-900"
                        >
                          {p.account_name ?? p.partner_name}
                        </Link>
                      ) : (
                        <div className="font-medium text-gray-900">{p.partner_name}</div>
                      )}
                      {p.account_id && (
                        <div className="text-xs text-gray-400 mt-0.5">{p.partner_name}</div>
                      )}
                    </td>

                    {/* Type / Tier */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-gray-600">{PARTNER_TYPE_LABELS[p.partner_type] ?? p.partner_type}</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full w-fit ${tierBadgeClass(p.tier)}`}>
                          {PARTNER_TIER_LABELS[p.tier] ?? p.tier}
                        </span>
                      </div>
                    </td>

                    {/* Score */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold ${scoreBadgeClass(p.overall_score)}`}>
                          {p.overall_score ?? '—'}
                        </span>
                        <span className={`text-xs font-medium ${delta.cls}`}>{delta.text}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${healthStatusBadgeClass(p.health_status)}`}>
                        {healthStatusLabel(p.health_status)}
                      </span>
                    </td>

                    {/* Risk */}
                    <td className="px-4 py-3 text-center">
                      {p.risk_score != null ? (
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${scoreBadgeClass(p.risk_score)}`}>
                          {p.risk_score}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Growth */}
                    <td className="px-4 py-3 text-center">
                      {p.growth_score != null ? (
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${scoreBadgeClass(p.growth_score)}`}>
                          {p.growth_score}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Owner */}
                    <td className="px-4 py-3 text-gray-700 text-sm">
                      {p.account_manager_name ?? <span className="text-gray-300">—</span>}
                    </td>

                    {/* Last Note */}
                    <td className="px-4 py-3">
                      {p.days_since_last_note != null ? (
                        <span className={`text-xs ${p.days_since_last_note > staleDays ? 'text-amber-600 font-medium' : 'text-gray-500'}`}>
                          {p.days_since_last_note === 0 ? 'Today' : `${p.days_since_last_note}d ago`}
                        </span>
                      ) : <span className="text-gray-300 text-xs">Never</span>}
                    </td>

                    {/* Alerts */}
                    <td className="px-4 py-3 text-center">
                      {p.active_alert_count > 0 ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${alertSeverityClass(p.top_alert_severity)}`}>
                          {p.active_alert_count}
                        </span>
                      ) : <span className="text-gray-200 text-xs">—</span>}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/partners/${p.id}`}
                          className="text-xs text-brand-700 hover:text-brand-900 font-medium"
                        >
                          View
                        </Link>
                        {(isAdmin || p.account_manager_id === currentUserId) && (
                          <button
                            onClick={() => openEdit(p)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {ui.modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-brand-700 rounded-t-xl">
              <h2 className="font-semibold text-white">
                {ui.modal === 'add' ? 'Add Partner' : 'Edit Partner'}
              </h2>
              <button onClick={closeModal} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {ui.error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{ui.error}</div>
              )}

              <div>
                <label className={LABEL}>Partner Name *</label>
                <input
                  type="text"
                  value={ui.form.partner_name}
                  onChange={e => setFormField('partner_name', e.target.value)}
                  placeholder="Acme Resellers Inc."
                  className={INPUT}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Type *</label>
                  <select value={ui.form.partner_type} onChange={e => setFormField('partner_type', e.target.value as PartnerType)} className={SELECT}>
                    {Object.entries(PARTNER_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Tier</label>
                  <select value={ui.form.tier} onChange={e => setFormField('tier', e.target.value as PartnerTier)} className={SELECT}>
                    {Object.entries(PARTNER_TIER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Status</label>
                  <select value={ui.form.status} onChange={e => setFormField('status', e.target.value as PartnerStatus)} className={SELECT}>
                    {Object.entries(PARTNER_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Region</label>
                  <input type="text" value={ui.form.region} onChange={e => setFormField('region', e.target.value)} placeholder="e.g. North America" className={INPUT} />
                </div>
              </div>

              <div>
                <label className={LABEL}>Linked CRM Account (optional)</label>
                <select value={ui.form.account_id} onChange={e => setFormField('account_id', e.target.value)} className={SELECT}>
                  <option value="">— No linked account —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                </select>
              </div>

              {isAdmin && (
                <div>
                  <label className={LABEL}>Account Manager</label>
                  <select value={ui.form.account_manager_id} onChange={e => setFormField('account_manager_id', e.target.value)} className={SELECT}>
                    <option value="">— Unassigned —</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Country</label>
                  <input type="text" value={ui.form.country} onChange={e => setFormField('country', e.target.value)} placeholder="Canada" className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Website</label>
                  <input type="text" value={ui.form.website} onChange={e => setFormField('website', e.target.value)} placeholder="https://..." className={INPUT} />
                </div>
              </div>

              <div>
                <label className={LABEL}>Description</label>
                <textarea
                  value={ui.form.description}
                  onChange={e => setFormField('description', e.target.value)}
                  rows={3}
                  placeholder="Brief description of the partner relationship…"
                  className={`${INPUT} resize-none`}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={closeModal} className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={ui.saving}
                className="bg-brand-700 text-white text-sm px-5 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
              >
                {ui.saving ? 'Saving…' : ui.modal === 'add' ? 'Add Partner' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
