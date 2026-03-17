'use client'

import type { DealStage } from '@/lib/types'
import type { InspectionResult } from '@/lib/deal-inspect'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(v: number | null): string | null {
  if (v == null || isNaN(Number(v))) return null
  const n = Number(v)
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${n.toFixed(0)}`
}

function fmtDate(d: string | null): string | null {
  if (!d) return null
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtTs(ts: string): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function healthBadgeClass(score: number | null): string {
  if (score == null) return 'bg-gray-100 text-gray-400'
  if (score >= 80) return 'bg-green-100 text-green-700'
  if (score >= 60) return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-600'
}

function stageBadgeClass(s: Pick<DealStage, 'is_won' | 'is_lost' | 'sort_order'> | null): string {
  if (!s) return 'bg-gray-100 text-gray-600'
  if (s.is_lost) return 'bg-red-50 text-red-600 ring-1 ring-red-200'
  if (s.is_won)  return 'bg-green-50 text-green-700 ring-1 ring-green-200'
  if (s.sort_order <= 3) return 'bg-gray-100 text-gray-700'
  if (s.sort_order <= 5) return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
  return 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ModalDeal {
  id: string
  deal_name: string
  deal_description: string | null
  value_amount: number | null
  total_contract_value: number | null
  close_date: string | null
  currency: string | null
  contract_term_months: number | null
  region: string | null
  deal_type: string | null
  health_score: number | null
  accounts: { account_name: string } | null
  deal_stages: Pick<DealStage, 'stage_name' | 'sort_order' | 'is_won' | 'is_lost'> | null
  deal_owner: { full_name: string | null } | null
  solutions_engineer: { full_name: string | null } | null
}

export interface ModalNote {
  note_text: string
  author?: { full_name: string | null } | null
  created_at: string
}

export type EmailStatus = 'idle' | 'checking' | 'summarizing' | 'inspecting' | 'emailing'

export interface DealDetailsModalProps {
  deal: ModalDeal
  /** slack_member_id of the deal owner — controls whether Slack Owner button appears */
  slackMemberId?: string | null
  slackTeamId?: string
  /** ISO timestamp of the most recent note (for "Days Since Update" row) */
  lastNoteDate?: string | null
  recentNote?: ModalNote | null
  summary: string | null
  summaryGeneratedAt: string | null
  loadingSummary: boolean
  inspection: InspectionResult | null
  inspectionLoading: boolean
  emailStatus: EmailStatus
  canViewAI: boolean
  onClose: () => void
  onRegenerateSummary: () => void
  onRunInspection: () => void
  onEmailOwner: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DealDetailsModal({
  deal,
  slackMemberId,
  slackTeamId = '',
  lastNoteDate,
  recentNote,
  summary,
  summaryGeneratedAt,
  loadingSummary,
  inspection,
  inspectionLoading,
  emailStatus,
  canViewAI,
  onClose,
  onRegenerateSummary,
  onRunInspection,
  onEmailOwner,
}: DealDetailsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-brand-700 rounded-t-xl shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="font-semibold text-white truncate">{deal.deal_name}</h3>
            {deal.deal_stages && (
              <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${stageBadgeClass(deal.deal_stages)}`}>{deal.deal_stages.stage_name}</span>
            )}
            {deal.health_score != null && (
              <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded ${healthBadgeClass(deal.health_score)}`}>{deal.health_score}</span>
            )}
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none ml-4 shrink-0">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Deal Info Grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {deal.accounts?.account_name && (
              <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Account</p><p className="text-sm text-gray-900 mt-0.5">{deal.accounts.account_name}</p></div>
            )}
            <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Deal Owner</p><p className="text-sm text-gray-900 mt-0.5">{deal.deal_owner?.full_name ?? '—'}</p></div>
            {deal.solutions_engineer?.full_name && (
              <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Solutions Engineer</p><p className="text-sm text-gray-900 mt-0.5">{deal.solutions_engineer.full_name}</p></div>
            )}
            {deal.value_amount != null && (
              <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">ACV</p><p className="text-sm text-gray-900 mt-0.5">{fmtCurrency(deal.value_amount)}</p></div>
            )}
            {deal.total_contract_value != null && (
              <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">TCV</p><p className="text-sm text-gray-900 mt-0.5">{fmtCurrency(deal.total_contract_value)}</p></div>
            )}
            {deal.close_date && (
              <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Close Date</p><p className="text-sm text-gray-900 mt-0.5">{fmtDate(deal.close_date)}</p></div>
            )}
            {deal.currency && (
              <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Currency</p><p className="text-sm text-gray-900 mt-0.5">{deal.currency}</p></div>
            )}
            {deal.contract_term_months != null && (
              <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Contract Term</p><p className="text-sm text-gray-900 mt-0.5">{deal.contract_term_months} months</p></div>
            )}
            {deal.region && (
              <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Region</p><p className="text-sm text-gray-900 mt-0.5">{deal.region}</p></div>
            )}
            {deal.deal_type && (
              <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Type</p><p className="text-sm text-gray-900 mt-0.5">{deal.deal_type}</p></div>
            )}
            {lastNoteDate && (() => {
              const days = Math.floor((Date.now() - new Date(lastNoteDate).getTime()) / 86400000)
              return <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Days Since Update</p><p className="text-sm text-gray-900 mt-0.5">{days}</p></div>
            })()}
            {deal.deal_description && (
              <div className="col-span-2"><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Description</p><p className="text-sm text-gray-700 mt-0.5">{deal.deal_description}</p></div>
            )}
          </div>

          {/* AI Summary */}
          {canViewAI && (
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-700">AI Summary</p>
                  {summaryGeneratedAt && <span className="text-xs text-gray-400">· {relativeTime(summaryGeneratedAt)}</span>}
                </div>
                <button onClick={onRegenerateSummary} disabled={loadingSummary} className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50 font-medium">
                  {loadingSummary ? 'Summarizing…' : summary ? 'Refresh' : 'Summarize'}
                </button>
              </div>
              {summary ? (
                <div className="bg-brand-50 rounded-lg p-4">
                  {summary.split('\n\n').filter(Boolean).map((block, i) => {
                    if (block.startsWith('## ')) {
                      const nl = block.indexOf('\n')
                      const heading = nl === -1 ? block.slice(3) : block.slice(3, nl)
                      const body    = nl === -1 ? '' : block.slice(nl + 1).trim()
                      return <div key={i} className={i > 0 ? 'mt-4' : ''}><p className="text-sm font-semibold text-gray-900 mb-1 leading-snug">{heading}</p>{body && <p className="text-xs text-gray-700 leading-relaxed">{body}</p>}</div>
                    }
                    return <p key={i} className={`text-xs text-gray-700 leading-relaxed${i > 0 ? ' mt-3' : ''}`}>{block}</p>
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Click Summarize to generate an AI summary from this deal&apos;s notes.</p>
              )}
            </div>
          )}

          {/* Deal Inspection */}
          {canViewAI && (
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-700">Deal Inspection</p>
                  {inspection && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ${inspection.score >= 70 ? 'bg-green-50 text-green-700 ring-green-200' : inspection.score >= 40 ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>{inspection.score}/100</span>
                  )}
                  {inspection?.runAt && <span className="text-xs text-gray-400">{relativeTime(inspection.runAt)}</span>}
                </div>
                <button onClick={onRunInspection} disabled={inspectionLoading || emailStatus !== 'idle'} className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50 font-medium">
                  {inspectionLoading ? 'Inspecting…' : inspection ? 'Refresh' : 'Run Inspection'}
                </button>
              </div>
              {inspection ? (
                <div className="space-y-1">
                  {inspection.checks.map(check => (
                    <div key={check.id} className="flex items-start gap-2 py-1">
                      <span className={`text-xs mt-0.5 shrink-0 font-bold ${check.status === 'pass' ? 'text-green-500' : check.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`}>
                        {check.status === 'pass' ? '✓' : check.status === 'weak' || check.status === 'stale' ? '~' : '✗'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs ${check.status === 'pass' ? 'text-gray-500' : 'text-gray-800 font-medium'}`}>{check.label}</span>
                        {check.status !== 'pass' && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{check.explanation}</p>}
                      </div>
                      {check.status !== 'pass' && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ring-1 shrink-0 ${check.severity === 'critical' ? 'bg-red-50 text-red-600 ring-red-200' : check.severity === 'medium' ? 'bg-amber-50 text-amber-600 ring-amber-200' : 'bg-gray-50 text-gray-500 ring-gray-200'}`}>{check.severity}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">{inspectionLoading ? 'Running inspection…' : 'Click Run Inspection to evaluate this deal.'}</p>
              )}
            </div>
          )}

          {/* Actions */}
          {canViewAI && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Actions</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={onEmailOwner} disabled={emailStatus !== 'idle'} className="inline-flex items-center gap-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-60 px-4 py-2 rounded-lg transition-colors">
                  {emailStatus !== 'idle'
                    ? { checking: 'Checking…', summarizing: 'Summarizing…', inspecting: 'Inspecting…', emailing: 'Generating…' }[emailStatus]
                    : <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" /><path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" /></svg> Email Owner</>
                  }
                </button>
                {slackMemberId && (
                  <a href={`slack://user?team=${slackTeamId}&id=${slackMemberId}`} className="inline-flex items-center gap-2 text-sm font-medium text-white bg-[#4A154B] hover:bg-[#3a1039] px-4 py-2 rounded-lg transition-colors">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
                    Slack Owner
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Most Recent Note */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Most Recent Note</p>
            {recentNote ? (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{recentNote.note_text}</p>
                <p className="text-xs text-gray-400 mt-2">{recentNote.author?.full_name ?? 'Unknown'} · {fmtTs(recentNote.created_at)}</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400">No notes yet.</p>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
