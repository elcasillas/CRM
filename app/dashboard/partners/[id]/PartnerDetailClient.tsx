'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type {
  PartnerDetailInitialData, PartnerMetric, PartnerHealthScore,
  PartnerFormData, PartnerType, PartnerTier, PartnerStatus,
} from '@/lib/partner-types'
import {
  healthStatusLabel, healthStatusBadgeClass, scoreBadgeClass,
  scoreDeltaDisplay, relativeTime, tierBadgeClass, partnerStatusBadgeClass,
  alertSeverityClass, CATEGORY_ORDER, CATEGORY_LABELS, categoryBarClass,
  categoryScoreClass, METRIC_CATEGORIES, PARTNER_TYPE_LABELS, PARTNER_TIER_LABELS,
  PARTNER_STATUS_LABELS,
} from '@/lib/partner-health'

const INPUT  = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100 text-sm'
const SELECT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-500 text-sm'
const LABEL  = 'block text-xs font-medium text-gray-600 mb-1'

type Tab = 'overview' | 'metrics' | 'notes'

interface MetricFormState {
  [key: string]: string  // metric_key → string value
}

function currentMonthDate(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export default function PartnerDetailClient({ initialData }: { initialData: PartnerDetailInitialData }) {
  const {
    partner, profiles, accounts,
    currentUserId, currentUserRole, staleDays,
  } = initialData

  const supabase = createClient()

  const [healthScore, setHealthScore]   = useState<PartnerHealthScore | null>(initialData.healthScore)
  const [metrics,     setMetrics]       = useState<PartnerMetric[]>(initialData.metrics)
  const [notes,       setNotes]         = useState(initialData.recentNotes)
  const [tab,         setTab]           = useState<Tab>('overview')

  // Metrics form state
  const [metricForm,  setMetricForm]    = useState<MetricFormState>(() => {
    const m: MetricFormState = {}
    for (const row of initialData.metrics) {
      m[row.metric_key] = row.metric_value != null ? String(row.metric_value) : ''
    }
    return m
  })
  const [savingMetrics, setSavingMetrics] = useState(false)
  const [metricsError,  setMetricsError]  = useState('')
  const [metricsSaved,  setMetricsSaved]  = useState(false)

  // Note form
  const [noteText,   setNoteText]   = useState('')
  const [loggingNote, setLoggingNote] = useState(false)

  // Edit modal
  const [editModal, setEditModal]   = useState(false)
  const [editForm,  setEditForm]    = useState<PartnerFormData>({
    partner_name:       partner.partner_name,
    partner_type:       partner.partner_type,
    tier:               partner.tier,
    status:             partner.status,
    account_id:         partner.account_id         ?? '',
    account_manager_id: partner.account_manager_id ?? '',
    region:             partner.region             ?? '',
    country:            partner.country            ?? '',
    website:            partner.website            ?? '',
    description:        partner.description        ?? '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError,  setEditError]  = useState('')

  const isAdmin   = currentUserRole === 'admin'
  const isManager = currentUserRole === 'sales_manager'
  const canEdit   = isAdmin || partner.account_manager_id === currentUserId

  // Score trend: current vs latest snapshot
  const latestSnapshot = initialData.snapshots[1] ?? null  // [0] = current month if snapped
  const scoreDelta = healthScore?.overall_score != null && latestSnapshot?.overall_score != null
    ? healthScore.overall_score - latestSnapshot.overall_score
    : null

  // ── Save metrics ──────────────────────────────────────────────────────────
  async function saveMetrics() {
    setSavingMetrics(true)
    setMetricsError('')
    setMetricsSaved(false)

    const metricsPayload = METRIC_CATEGORIES.flatMap(cat =>
      cat.metrics.map(m => ({
        key:      m.key,
        category: cat.key,
        value:    metricForm[m.key] !== '' && metricForm[m.key] != null
                    ? parseFloat(metricForm[m.key])
                    : null,
      }))
    ).filter(m => m.value !== null || metricForm[m.key] !== '')

    const res  = await fetch(`/api/partners/${partner.id}/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric_date: currentMonthDate(), metrics: metricsPayload }),
    })
    const json = await res.json()

    setSavingMetrics(false)
    if (!res.ok) {
      setMetricsError(json.error ?? 'Failed to save metrics')
      return
    }

    // Update health score from response
    if (json.score) {
      setHealthScore(prev => prev ? { ...prev, ...json.score } : json.score)
    }
    setMetricsSaved(true)
    setTimeout(() => setMetricsSaved(false), 3000)
  }

  // ── Log note ──────────────────────────────────────────────────────────────
  async function logNote() {
    if (!noteText.trim()) return
    setLoggingNote(true)
    const { data: insertedNote, error } = await supabase
      .from('notes')
      .insert({ entity_type: 'partner', entity_id: partner.id, note_text: noteText.trim(), created_by: currentUserId })
      .select('id, note_text, created_at, created_by')
      .single()

    setLoggingNote(false)
    if (error || !insertedNote) return

    setNotes(prev => [{
      id:              (insertedNote as Record<string, unknown>).id as string,
      note_text:       (insertedNote as Record<string, unknown>).note_text as string,
      created_at:      (insertedNote as Record<string, unknown>).created_at as string,
      created_by_name: profiles.find(p => p.id === currentUserId)?.full_name ?? null,
    }, ...prev])
    setNoteText('')
  }

  // ── Save edit ─────────────────────────────────────────────────────────────
  async function saveEdit() {
    if (!editForm.partner_name.trim()) { setEditError('Name is required'); return }
    setEditSaving(true); setEditError('')
    const res  = await fetch(`/api/partners/${partner.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editForm,
        account_id:         editForm.account_id         || null,
        account_manager_id: editForm.account_manager_id || null,
      }),
    })
    const json = await res.json()
    setEditSaving(false)
    if (!res.ok) { setEditError(json.error ?? 'Failed to save'); return }
    setEditModal(false)
    // Reload to pick up updated partner data
    window.location.reload()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-400 mb-4">
        <Link href="/dashboard/partners" className="hover:text-gray-600">Partners</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700">{partner.partner_name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">{partner.partner_name}</h1>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tierBadgeClass(partner.tier)}`}>
                {PARTNER_TIER_LABELS[partner.tier] ?? partner.tier}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${partnerStatusBadgeClass(partner.status)}`}>
                {PARTNER_STATUS_LABELS[partner.status] ?? partner.status}
              </span>
            </div>
            <div className="text-sm text-gray-500 mt-1 flex items-center gap-3">
              <span>{PARTNER_TYPE_LABELS[partner.partner_type] ?? partner.partner_type}</span>
              {partner.region && <><span className="text-gray-300">·</span><span>{partner.region}</span></>}
              {partner.account?.account_name && <><span className="text-gray-300">·</span><Link href={`/dashboard/accounts/${partner.account_id}`} className="text-brand-600 hover:underline">{partner.account.account_name}</Link></>}
              {partner.account_manager?.full_name && <><span className="text-gray-300">·</span><span>{partner.account_manager.full_name}</span></>}
            </div>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => setEditModal(true)}
            className="text-sm border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {/* Score Card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="sm:col-span-1 flex flex-col items-center justify-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold border-4 ${
            healthScore?.overall_score == null ? 'border-gray-200 text-gray-300' :
            healthScore.overall_score >= 75 ? 'border-green-400 text-green-700' :
            healthScore.overall_score >= 50 ? 'border-amber-400 text-amber-700' :
            'border-red-400 text-red-600'
          }`}>
            {healthScore?.overall_score ?? '—'}
          </div>
          <span className="text-xs text-gray-500 mt-1">Overall</span>
        </div>

        <div className="flex flex-col items-center justify-center gap-1">
          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${healthStatusBadgeClass(healthScore?.health_status)}`}>
            {healthStatusLabel(healthScore?.health_status)}
          </span>
          <span className="text-xs text-gray-400">Health Status</span>
        </div>

        <div className="flex flex-col items-center justify-center gap-1">
          {(() => { const d = scoreDeltaDisplay(scoreDelta); return <span className={`text-lg font-semibold ${d.cls}`}>{d.text}</span> })()}
          <span className="text-xs text-gray-400">3-Month Trend</span>
        </div>

        <div className="flex flex-col items-center justify-center gap-1">
          <span className={`text-lg font-semibold ${scoreBadgeClass(healthScore?.risk_score).replace('bg-', 'text-').replace('-100', '-700').replace('-600', '-600')}`}>
            {healthScore?.risk_score ?? '—'}
          </span>
          <span className="text-xs text-gray-400">Risk Score</span>
        </div>

        <div className="flex flex-col items-center justify-center gap-1">
          <span className={`text-lg font-semibold ${scoreBadgeClass(healthScore?.growth_score).replace('bg-', 'text-').replace('-100', '-700').replace('-600', '-600')}`}>
            {healthScore?.growth_score ?? '—'}
          </span>
          <span className="text-xs text-gray-400">Growth Score</span>
          {healthScore?.confidence_score != null && healthScore.confidence_score < 70 && (
            <span className="text-xs text-amber-500">{healthScore.confidence_score}% data confidence</span>
          )}
        </div>
      </div>

      {/* Active Alerts Banner */}
      {initialData.alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {initialData.alerts.slice(0, 3).map(alert => (
            <div key={alert.id} className={`flex items-start gap-3 px-4 py-3 rounded-lg text-sm border ${
              alert.severity === 'critical' ? 'bg-red-50 border-red-200 text-red-700' :
              alert.severity === 'warning'  ? 'bg-amber-50 border-amber-200 text-amber-700' :
              'bg-blue-50 border-blue-200 text-blue-700'
            }`}>
              <span className="font-semibold capitalize">{alert.severity}:</span>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['overview', 'metrics', 'notes'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-brand-700 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'overview' ? 'Overview' : t === 'metrics' ? 'Metrics' : 'Notes'}
            {t === 'notes' && notes.length > 0 && (
              <span className="ml-1.5 bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full">{notes.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Overview Tab: 8 Category Score Cards */}
      {tab === 'overview' && (
        <div>
          {!healthScore?.category_scores && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">No health score data yet.</p>
              <p className="text-xs mt-1">Enter metrics in the Metrics tab to generate a score.</p>
            </div>
          )}
          {healthScore?.category_scores && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {CATEGORY_ORDER.map(catKey => {
                const score    = healthScore.category_scores?.[catKey] ?? null
                const label    = CATEGORY_LABELS[catKey] ?? catKey
                const barClass = categoryBarClass(score)
                const textCls  = categoryScoreClass(score)
                const debug    = (healthScore.score_debug as Record<string, Record<string, unknown>> | null)?.[catKey]
                return (
                  <div key={catKey} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
                      <span className={`text-xl font-bold ${textCls}`}>{score ?? '—'}</span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barClass}`}
                        style={{ width: `${score ?? 0}%` }}
                      />
                    </div>
                    {/* Debug hint */}
                    {debug && (
                      <div className="mt-2 text-xs text-gray-400 space-y-0.5">
                        {catKey === 'engagement' && debug.days_since_note != null && (
                          <div>Last note: {debug.days_since_note as number}d ago · {debug.meetings_90d as number} meetings (90d)</div>
                        )}
                        {catKey === 'growth' && debug.active_opps != null && (
                          <div>{debug.active_opps as number} active opps · {debug.recent_wins as number} recent wins</div>
                        )}
                        {catKey === 'revenue' && debug.n_mrr != null && (
                          <div>MRR score: {debug.n_mrr as number} · QoQ: {debug.n_mrr_qoq as number}</div>
                        )}
                        {catKey === 'customer' && debug.n_churn != null && (
                          <div>Churn score: {debug.n_churn as number} · Net new: {debug.n_net_new as number}</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {/* Description */}
          {partner.description && (
            <div className="mt-6 bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-700">
              {partner.description}
            </div>
          )}
        </div>
      )}

      {/* Metrics Tab */}
      {tab === 'metrics' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Enter metrics for <strong>{new Date(currentMonthDate()).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}</strong>.
              CRM-derived metrics (engagement, growth) are computed automatically.
            </p>
            <div className="flex items-center gap-3">
              {metricsSaved && <span className="text-sm text-green-600">Saved ✓</span>}
              {metricsError && <span className="text-sm text-red-600">{metricsError}</span>}
              <button
                onClick={saveMetrics}
                disabled={savingMetrics}
                className="bg-brand-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
              >
                {savingMetrics ? 'Saving…' : 'Save Metrics'}
              </button>
            </div>
          </div>

          {METRIC_CATEGORIES.map(cat => (
            <div key={cat.key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-700">{cat.label}</span>
                {healthScore?.category_scores?.[cat.key] != null && (
                  <span className={`text-sm font-bold ${categoryScoreClass(healthScore.category_scores[cat.key])}`}>
                    {healthScore.category_scores[cat.key]}
                  </span>
                )}
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cat.metrics.map(m => (
                  <div key={m.key}>
                    <label className={LABEL} title={m.description}>{m.label}</label>
                    <div className="flex items-center gap-1">
                      {m.unit === 'boolean' ? (
                        <select
                          value={metricForm[m.key] ?? ''}
                          onChange={e => setMetricForm(prev => ({ ...prev, [m.key]: e.target.value }))}
                          className={SELECT}
                        >
                          <option value="">— Not set —</option>
                          <option value="1">Yes (1)</option>
                          <option value="0">No (0)</option>
                        </select>
                      ) : (
                        <input
                          type="number"
                          step={m.unit === 'percent' || m.unit === 'number' ? '0.1' : '1'}
                          value={metricForm[m.key] ?? ''}
                          onChange={e => setMetricForm(prev => ({ ...prev, [m.key]: e.target.value }))}
                          placeholder="—"
                          className={INPUT}
                        />
                      )}
                      {m.unit === 'percent'  && <span className="text-xs text-gray-400 flex-shrink-0">%</span>}
                      {m.unit === 'currency' && <span className="text-xs text-gray-400 flex-shrink-0">$</span>}
                      {m.unit === 'days'     && <span className="text-xs text-gray-400 flex-shrink-0">d</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notes Tab */}
      {tab === 'notes' && (
        <div className="space-y-4">
          {/* Add note */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <label className={LABEL}>Log a Note</label>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={3}
              placeholder="Add a note about this partner relationship…"
              className={`${INPUT} resize-none mb-3`}
            />
            <button
              onClick={logNote}
              disabled={loggingNote || !noteText.trim()}
              className="bg-brand-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
            >
              {loggingNote ? 'Logging…' : 'Log Note'}
            </button>
          </div>

          {/* Notes list */}
          {notes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No notes yet for this partner.</p>
          )}
          {notes.map(n => (
            <div key={n.id} className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.note_text}</p>
              <div className="mt-2 text-xs text-gray-400 flex items-center gap-2">
                {n.created_by_name && <span>{n.created_by_name}</span>}
                <span>·</span>
                <span>{relativeTime(n.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 bg-brand-700 rounded-t-xl">
              <h2 className="font-semibold text-white">Edit Partner</h2>
              <button onClick={() => setEditModal(false)} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {editError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{editError}</div>}
              <div>
                <label className={LABEL}>Partner Name *</label>
                <input type="text" value={editForm.partner_name} onChange={e => setEditForm(f => ({ ...f, partner_name: e.target.value }))} className={INPUT} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Type</label>
                  <select value={editForm.partner_type} onChange={e => setEditForm(f => ({ ...f, partner_type: e.target.value as PartnerType }))} className={SELECT}>
                    {Object.entries(PARTNER_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Tier</label>
                  <select value={editForm.tier} onChange={e => setEditForm(f => ({ ...f, tier: e.target.value as PartnerTier }))} className={SELECT}>
                    {Object.entries(PARTNER_TIER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Status</label>
                  <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as PartnerStatus }))} className={SELECT}>
                    {Object.entries(PARTNER_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Region</label>
                  <input type="text" value={editForm.region} onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))} className={INPUT} />
                </div>
              </div>
              <div>
                <label className={LABEL}>Linked Account</label>
                <select value={editForm.account_id} onChange={e => setEditForm(f => ({ ...f, account_id: e.target.value }))} className={SELECT}>
                  <option value="">— No linked account —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                </select>
              </div>
              {isAdmin && (
                <div>
                  <label className={LABEL}>Account Manager</label>
                  <select value={editForm.account_manager_id} onChange={e => setEditForm(f => ({ ...f, account_manager_id: e.target.value }))} className={SELECT}>
                    <option value="">— Unassigned —</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Country</label>
                  <input type="text" value={editForm.country} onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Website</label>
                  <input type="text" value={editForm.website} onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))} className={INPUT} />
                </div>
              </div>
              <div>
                <label className={LABEL}>Description</label>
                <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} className={`${INPUT} resize-none`} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setEditModal(false)} className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2">Cancel</button>
              <button onClick={saveEdit} disabled={editSaving} className="bg-brand-700 text-white text-sm px-5 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors">
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
