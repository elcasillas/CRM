'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { DealStage, NoteWithAuthor } from '@/lib/types'
import type { InspectionResult } from '@/lib/deal-inspect'
import { DealDetailsModal } from '../DealDetailsModal'
import { useBeforeUnload, formIsDirty } from '@/hooks/useUnsavedChanges'
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog'
import { DealStageBadge } from '@/components/dashboard/deal-stage-badge'
import { DealWorksheet } from '@/components/deals/DealWorksheet'
import type { WorksheetData, WorksheetCalcs } from '@/components/deals/DealWorksheet'

const supabase = createClient()
const SLACK_TEAM_ID = process.env.NEXT_PUBLIC_SLACK_TEAM_ID ?? ''

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20 text-sm'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function ViewField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <div className="text-sm text-gray-900">{children}</div>
    </div>
  )
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null || isNaN(Number(v))) return '—'
  const n = Number(v)
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${n.toFixed(0)}`
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTs(ts: string): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}


function healthBadgeClass(score: number | null): string {
  if (score == null) return 'bg-gray-100 text-gray-400'
  if (score >= 80) return 'bg-green-100 text-green-700'
  if (score >= 60) return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-600'
}


type DealData = {
  id: string
  deal_name: string
  deal_description: string | null
  account_id: string | null
  stage_id: string
  deal_owner_id: string
  solutions_engineer_id: string | null
  amount: number | null
  contract_term_months: number | null
  total_contract_value: number | null
  value_amount: number | null
  currency: string
  close_date: string | null
  region: string | null
  deal_type: string | null
  worksheet_data: unknown
  last_activity_at: string | null
  created_at: string
  updated_at: string | null
  health_score: number | null
  accounts: { account_name: string } | null
  deal_stages: Pick<DealStage, 'stage_name' | 'sort_order' | 'is_closed' | 'is_won' | 'is_lost'> | null
  deal_owner: { id: string; full_name: string | null; slack_member_id: string | null } | null
  solutions_engineer: { id: string; full_name: string | null } | null
}

type ProfileRow = { id: string; full_name: string | null; role: string; slack_member_id: string | null }
type AccountRow = { id: string; account_name: string }

type FormData = {
  deal_name: string
  deal_description: string
  account_id: string
  stage_id: string
  deal_owner_id: string
  solutions_engineer_id: string
  close_date: string
  region: string
  deal_type: string
}

export default function DealDetailPage() {
  const { id }      = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router      = useRouter()
  const backHref    = searchParams.get('back') ?? '/dashboard/deals'

  const [deal,     setDeal]     = useState<DealData | null>(null)
  const [notes,    setNotes]    = useState<NoteWithAuthor[]>([])
  const [stages,   setStages]   = useState<DealStage[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Role
  const [isAdmin,        setIsAdmin]        = useState(false)
  const [isSalesManager, setIsSalesManager] = useState(false)
  const [userId,         setUserId]         = useState('')

  // Edit form
  const [isEditing, setIsEditing] = useState(false)
  const [form,      setFormState] = useState<FormData | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved,     setSaved]     = useState(false)

  // Notes form
  const [noteText,       setNoteText]       = useState('')
  const [loggingNote,    setLoggingNote]    = useState(false)
  const [confirmDeleteNote, setConfirmDeleteNote] = useState<string | null>(null)
  const [showHistoricalNotes, setShowHistoricalNotes] = useState(false)

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Unsaved changes tracking
  const initialFormRef = useRef<FormData | null>(null)
  const pendingNavRef  = useRef<string | null>(null)

  // Worksheet state (managed inside DealWorksheet; refs hold latest values for save)
  const worksheetDataRef  = useRef<WorksheetData | null>(null)
  const worksheetCalcsRef = useRef<WorksheetCalcs | null>(null)
  const [showNavWarning, setShowNavWarning] = useState(false)
  const [navWarnSaving, setNavWarnSaving]   = useState(false)

  // Deal Details Modal
  const [showDetailsModal,          setShowDetailsModal]          = useState(false)
  const [detailsSummary,            setDetailsSummary]            = useState<string | null>(null)
  const [detailsSummaryGeneratedAt, setDetailsSummaryGeneratedAt] = useState<string | null>(null)
  const [loadingDetailsSummary,     setLoadingDetailsSummary]     = useState(false)
  const [inspection,                setInspection]                = useState<InspectionResult | null>(null)
  const [inspectionLoading,         setInspectionLoading]         = useState(false)
  const [emailStatus,               setEmailStatus]               = useState<'idle'|'checking'|'summarizing'|'inspecting'|'emailing'>('idle')

  // ── Data fetchers ──────────────────────────────────────────────────────────

  const fetchDeal = useCallback(async () => {
    const { data, error } = await supabase
      .from('deals')
      .select('*, deal_stages(*), accounts(account_name), deal_owner:profiles!deal_owner_id(id,full_name,slack_member_id), solutions_engineer:profiles!solutions_engineer_id(id,full_name)')
      .eq('id', id)
      .single()
    if (error || !data) { setNotFound(true); return }
    setDeal(data as unknown as DealData)
    const newForm: FormData = {
      deal_name:             data.deal_name,
      deal_description:      data.deal_description ?? '',
      account_id:            data.account_id ?? '',
      stage_id:              data.stage_id,
      deal_owner_id:         data.deal_owner_id,
      solutions_engineer_id: data.solutions_engineer_id ?? '',
      close_date:            data.close_date ?? '',
      region:                (data as unknown as DealData).region ?? '',
      deal_type:             (data as unknown as DealData).deal_type ?? '',
    }
    // Reset worksheet refs — DealWorksheet will repopulate them on mount when editing starts
    worksheetDataRef.current  = null
    worksheetCalcsRef.current = null
    setFormState(newForm)
    initialFormRef.current = newForm
  }, [id])

  const fetchNotes = useCallback(async () => {
    const { data } = await supabase
      .from('notes')
      .select('*, author:profiles!created_by(full_name)')
      .eq('entity_type', 'deal')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
    // Defensive dedup: if duplicate DB rows exist (e.g. from CSV re-imports where
    // the existingNotes dedup query hit URL length limits), de-duplicate by
    // note_text + created_at before rendering so each note appears only once.
    const seen = new Set<string>()
    const deduped = (data ?? []).filter(n => {
      const key = `${n.note_text}::${n.created_at}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    setNotes(deduped as NoteWithAuthor[])
  }, [id])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single()
      const role = profile?.role ?? ''
      setIsAdmin(role === 'admin')
      setIsSalesManager(role === 'sales_manager')

      await Promise.all([
        fetchDeal(),
        fetchNotes(),
        supabase.from('deal_stages').select('*').order('sort_order').then(({ data }) => setStages((data ?? []) as DealStage[])),
        supabase.from('accounts').select('id,account_name').order('account_name').then(({ data }) => setAccounts((data ?? []) as AccountRow[])),
        supabase.from('profiles').select('id,full_name,role,slack_member_id').order('full_name').then(({ data }) => setProfiles((data ?? []) as ProfileRow[])),
      ])

      setLoading(false)
    }
    init()
  }, [fetchDeal, fetchNotes])

  const canViewAI = isAdmin || isSalesManager

  const isDirty = isEditing && formIsDirty(form, initialFormRef.current)
  useBeforeUnload(isDirty)

  function cancelEditing() {
    // Reset form to the last-saved deal values
    setFormState(initialFormRef.current)
    setIsEditing(false)
    setSaveError(null)
  }

  // ── Deal Details Modal ───────────────────────────────────────────────────────

  async function openDetailsModal() {
    setShowDetailsModal(true)
    const [sRes, iRes] = await Promise.all([
      fetch(`/api/deals/${id}/summarize`),
      fetch(`/api/deals/${id}/inspect`),
    ])
    if (sRes.ok) { const d = await sRes.json(); if (d.summary) { setDetailsSummary(d.summary); setDetailsSummaryGeneratedAt(d.generatedAt ?? null) } }
    if (iRes.ok) { const d = await iRes.json(); if (d.result) setInspection(d.result as InspectionResult) }
  }

  async function handleRegenerateSummary() {
    setLoadingDetailsSummary(true)
    const res = await fetch(`/api/deals/${id}/summarize`, { method: 'POST' })
    if (res.ok) { const d = await res.json(); if (d.summary) { setDetailsSummary(d.summary); setDetailsSummaryGeneratedAt(d.generatedAt ?? null) } }
    setLoadingDetailsSummary(false)
  }

  async function handleRunInspection() {
    setInspectionLoading(true)
    const res = await fetch(`/api/deals/${id}/inspect`, { method: 'POST' })
    if (res.ok) { const d = await res.json(); if (d.result) setInspection(d.result as InspectionResult) }
    setInspectionLoading(false)
  }

  async function handleEmailOwner() {
    if (!deal) return
    setEmailStatus('checking')
    if (!detailsSummary) {
      setEmailStatus('summarizing')
      try { const res = await fetch(`/api/deals/${id}/summarize`, { method: 'POST' }); if (res.ok) { const d = await res.json(); if (d.summary) { setDetailsSummary(d.summary); setDetailsSummaryGeneratedAt(d.generatedAt ?? null) } } } catch { /* continue */ }
    }
    if (!inspection) {
      setEmailStatus('inspecting')
      try { const res = await fetch(`/api/deals/${id}/inspect`, { method: 'POST' }); if (res.ok) { const d = await res.json(); if (d.result) setInspection(d.result as InspectionResult) } } catch { /* continue */ }
    }
    setEmailStatus('emailing')
    let ownerEmail = ''
    try { const res = await fetch('/api/admin/users'); if (res.ok) { const users = await res.json(); const owner = users.find((u: { id: string; email: string }) => u.id === deal.deal_owner_id); ownerEmail = owner?.email ?? '' } } catch { /* silent */ }
    try {
      const res = await fetch(`/api/deals/${id}/compose-email`, { method: 'POST' })
      if (res.ok) { const data = await res.json(); if (data.subject && data.body) { window.open(`mailto:${ownerEmail}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(data.body)}`, '_blank'); setEmailStatus('idle'); return } }
    } catch { /* fallback */ }
    const stageName = deal.deal_stages?.stage_name ?? 'unknown stage'
    const ownerName = deal.deal_owner?.full_name ?? 'there'
    window.open(`mailto:${ownerEmail}?subject=${encodeURIComponent(`Deal Update: ${deal.deal_name}`)}&body=${encodeURIComponent(`Hi ${ownerName},\n\nI wanted to follow up on "${deal.deal_name}" (${stageName}).\n\nCould you please provide a current status update and flag any blockers?\n\nThanks.`)}`, '_blank')
    setEmailStatus('idle')
  }

  // ── Save deal ────────────────────────────────────────────────────────────────

  async function saveDeal(): Promise<boolean> {
    if (!form || !deal) return false
    setSaving(true); setSaveError(null); setSaved(false)
    const { data: { user: u } } = await supabase.auth.getUser()
    const prevStageId = deal.stage_id
    const wCalcs = worksheetCalcsRef.current
    const wData  = worksheetDataRef.current
    const payload = {
      deal_name:             form.deal_name.trim(),
      deal_description:      form.deal_description.trim() || null,
      account_id:            form.account_id || null,
      stage_id:              form.stage_id,
      deal_owner_id:         form.deal_owner_id,
      solutions_engineer_id: form.solutions_engineer_id || null,
      // Revenue fields derived from worksheet calculations
      amount:                wCalcs && wCalcs.mrr > 0               ? wCalcs.mrr               : null,
      contract_term_months:  wCalcs && wCalcs.contractTermMonths > 0 ? wCalcs.contractTermMonths : null,
      value_amount:          wCalcs && wCalcs.acv > 0               ? wCalcs.acv               : null,
      total_contract_value:  wCalcs && wCalcs.tcv > 0               ? wCalcs.tcv               : null,
      currency:              wCalcs                                  ? wCalcs.currency          : (deal.currency || 'USD'),
      worksheet_data:        wData ?? null,
      close_date:            form.close_date || null,
      region:                form.region || null,
      deal_type:             form.deal_type || null,
      last_activity_at:      new Date().toISOString(),
    }
    const { error } = await supabase.from('deals').update(payload).eq('id', id)
    if (error) {
      setSaveError(error.message)
      setSaving(false)
      return false
    } else {
      if (form.stage_id !== prevStageId) {
        await supabase.from('deal_stage_history').insert({
          deal_id: id, from_stage_id: prevStageId, to_stage_id: form.stage_id, changed_by: u!.id,
        })
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      setIsEditing(false)
      await fetchDeal()
    }
    setSaving(false)
    return true
  }

  // ── Notes ────────────────────────────────────────────────────────────────────

  async function addNote() {
    if (!noteText.trim()) return
    setLoggingNote(true)
    const { error } = await supabase.from('notes').insert({
      entity_type: 'deal', entity_id: id, note_text: noteText.trim(), created_by: userId,
    })
    if (!error) { setNoteText(''); fetchNotes() }
    setLoggingNote(false)
  }

  async function deleteNote(noteId: string) {
    await supabase.from('notes').delete().eq('id', noteId)
    setNotes(prev => prev.filter(n => n.id !== noteId))
    setConfirmDeleteNote(null)
  }

  // ── Delete deal ──────────────────────────────────────────────────────────────

  async function deleteDeal() {
    const { error } = await supabase.from('deals').delete().eq('id', id)
    if (!error) router.push(backHref)
    else console.error('delete deal:', error.message)
    setConfirmDelete(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  if (notFound || !deal || !form) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <p className="text-gray-500">Deal not found.</p>
        <Link href="/dashboard/deals" className="text-[#00ADB1] hover:text-[#00989C] text-sm mt-2 inline-block">← Back to Deals</Link>
      </div>
    )
  }

  const canEditOwner = isAdmin || isSalesManager

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => {
              if (isDirty) { pendingNavRef.current = backHref; setShowNavWarning(true) }
              else router.push(backHref)
            }}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          >← Back</button>
          <h1 className="text-xl font-semibold text-gray-900 truncate">{deal.deal_name}</h1>
          {deal.deal_stages && (
            <DealStageBadge stageName={deal.deal_stages.stage_name} className="shrink-0" />
          )}
          {deal.health_score != null && (
            <span className={`shrink-0 inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold ${healthBadgeClass(deal.health_score)}`}>
              {deal.health_score}
            </span>
          )}
          <button onClick={openDetailsModal} title="View deal details" className="shrink-0 text-gray-400 hover:text-[#00ADB1] transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
          </button>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            {confirmDelete ? (
              <>
                <span className="text-xs text-gray-400">Delete this deal?</span>
                <button onClick={deleteDeal} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-sm text-gray-400 hover:text-red-600 transition-colors">Delete</button>
            )}
          </div>
        )}
      </div>

      {/* Deal Fields */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

        {/* Card header — matches Account Modal style */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#00ADB1] rounded-t-xl">
          <h2 className="font-semibold text-white">Deal Information</h2>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              title="Edit deal"
              className="text-white/70 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
              </svg>
            </button>
          )}
        </div>

        <div className="px-6 py-5">
        {isEditing ? (

          /* ── Edit mode ─────────────────────────────────────────────────────── */
          <div className="space-y-4">
            <Field label="Account">
              <div className="flex items-center gap-2">
                <select value={form.account_id} onChange={e => setFormState(f => f && ({ ...f, account_id: e.target.value }))} className={`${INPUT} flex-1`}>
                  <option value="">— none —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                </select>
                {form.account_id && (
                  <Link href={`/dashboard/accounts/${form.account_id}`} target="_blank" rel="noopener noreferrer" title="Open account" className="shrink-0 text-gray-400 hover:text-[#00ADB1] transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" /><path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" /></svg>
                  </Link>
                )}
              </div>
            </Field>

            <Field label="Deal Name">
              <input type="text" value={form.deal_name} onChange={e => setFormState(f => f && ({ ...f, deal_name: e.target.value }))} className={INPUT} />
            </Field>

            <Field label="Description">
              <textarea value={form.deal_description} onChange={e => setFormState(f => f && ({ ...f, deal_description: e.target.value }))} rows={3} placeholder="Optional description…" className={`${INPUT} resize-none`} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Region">
                <select value={form.region} onChange={e => setFormState(f => f && ({ ...f, region: e.target.value }))} className={INPUT}>
                  <option value="">— none —</option>
                  <option value="North America">North America</option>
                  <option value="Europe/Asia/Pacific/Africa">Europe/Asia/Pacific/Africa</option>
                  <option value="Latin America/Caribbean">Latin America/Caribbean</option>
                </select>
              </Field>
              <Field label="Stage">
                <select value={form.stage_id} onChange={e => setFormState(f => f && ({ ...f, stage_id: e.target.value }))} className={INPUT}>
                  <option value="">— select —</option>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Type of Deal">
                <select value={form.deal_type} onChange={e => setFormState(f => f && ({ ...f, deal_type: e.target.value }))} className={INPUT}>
                  <option value="">— none —</option>
                  <option value="Migration">Migration</option>
                  <option value="Organic One-Time">Organic One-Time</option>
                  <option value="Organic Recurring">Organic Recurring</option>
                  <option value="Pro Services">Pro Services</option>
                </select>
              </Field>
              <Field label="Close Date">
                <input type="date" value={form.close_date} onChange={e => setFormState(f => f && ({ ...f, close_date: e.target.value }))} className={INPUT} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Deal Owner">
                {canEditOwner ? (
                  <select value={form.deal_owner_id} onChange={e => setFormState(f => f && ({ ...f, deal_owner_id: e.target.value }))} className={INPUT}>
                    {profiles.filter(p => p.role === 'sales').map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>)}
                  </select>
                ) : (
                  <p className={`${INPUT} bg-gray-50 text-gray-600 cursor-default`}>{profiles.find(p => p.id === form.deal_owner_id)?.full_name ?? '—'}</p>
                )}
              </Field>
              <Field label="Solutions Engineer">
                <select value={form.solutions_engineer_id} onChange={e => setFormState(f => f && ({ ...f, solutions_engineer_id: e.target.value }))} className={INPUT}>
                  <option value="">— none —</option>
                  {profiles.filter(p => p.role === 'solutions_engineer').map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>)}
                </select>
              </Field>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={saveDeal}
                disabled={saving || !form.deal_name.trim() || !form.stage_id}
                className="bg-[#00ADB1] hover:bg-[#00989C] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancelEditing}
                disabled={saving}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-2 rounded-lg border border-gray-300 hover:border-gray-400 transition-colors"
              >
                Cancel
              </button>
              {saved    && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
              {saveError && <span className="text-sm text-red-600">{saveError}</span>}
            </div>
          </div>

        ) : (

          /* ── View mode ─────────────────────────────────────────────────────── */
          <div className="space-y-4">
            <ViewField label="Account">
              {deal.accounts ? (
                <div className="flex items-center gap-2">
                  <span>{deal.accounts.account_name}</span>
                  {deal.account_id && (
                    <Link href={`/dashboard/accounts/${deal.account_id}`} target="_blank" rel="noopener noreferrer" title="Open account" className="text-gray-400 hover:text-[#00ADB1] transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" /><path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" /></svg>
                    </Link>
                  )}
                </div>
              ) : <span className="text-gray-400">—</span>}
            </ViewField>

            <ViewField label="Deal Name">
              <span className="font-medium text-gray-900">{deal.deal_name}</span>
            </ViewField>

            {deal.deal_description && (
              <ViewField label="Description">
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{deal.deal_description}</p>
              </ViewField>
            )}

            <div className="grid grid-cols-2 gap-4">
              <ViewField label="Region">
                <span>{deal.region ?? <span className="text-gray-400">—</span>}</span>
              </ViewField>
              <ViewField label="Stage">
                {deal.deal_stages
                  ? <DealStageBadge stageName={deal.deal_stages.stage_name} />
                  : <span className="text-gray-400">—</span>}
              </ViewField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ViewField label="Type of Deal">
                <span>{deal.deal_type ?? <span className="text-gray-400">—</span>}</span>
              </ViewField>
              <ViewField label="Close Date">
                <span>{fmtDate(deal.close_date)}</span>
              </ViewField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ViewField label="Deal Owner">
                <span>{deal.deal_owner?.full_name ?? <span className="text-gray-400">—</span>}</span>
              </ViewField>
              <ViewField label="Solutions Engineer">
                <span>{deal.solutions_engineer?.full_name ?? <span className="text-gray-400">—</span>}</span>
              </ViewField>
            </div>

          </div>

        )}
        </div>
      </div>

      {/* Revenue */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center px-6 py-3 bg-[#00ADB1] rounded-t-xl">
          <h2 className="font-semibold text-white">Revenue</h2>
        </div>
        {isEditing ? (
          <div className="px-5 py-5 overflow-x-auto">
            <DealWorksheet
              initialData={deal.worksheet_data as unknown as WorksheetData | null}
              onChange={(data, calcs) => {
                worksheetDataRef.current  = data
                worksheetCalcsRef.current = calcs
              }}
            />
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <ViewField label="Currency">
                <span>{deal.currency || <span className="text-gray-400">—</span>}</span>
              </ViewField>
              <ViewField label="Term">
                <span>{deal.contract_term_months != null ? `${deal.contract_term_months} months` : <span className="text-gray-400">—</span>}</span>
              </ViewField>
            </div>
            <ViewField label="MRR Amount">
              <span className="font-medium">
                {deal.amount != null
                  ? `$${Number(deal.amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                  : <span className="text-gray-400">—</span>}
              </span>
            </ViewField>
            <div className="grid grid-cols-2 gap-4">
              <ViewField label="Annual Contract Value">
                <span className="font-medium">{fmtCurrency(deal.value_amount)}</span>
              </ViewField>
              <ViewField label="Total Contract Value">
                <span className="font-medium">{fmtCurrency(deal.total_contract_value)}</span>
              </ViewField>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <p className="text-sm font-semibold text-gray-700 mb-4">Notes</p>
        <div className="mb-4">
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            rows={3}
            placeholder="Add a note…"
            className={`${INPUT} resize-none mb-3`}
          />
          <div className="flex justify-end">
            <button
              onClick={addNote}
              disabled={loggingNote || !noteText.trim()}
              className="bg-[#00ADB1] hover:bg-[#00989C] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {loggingNote ? 'Saving…' : 'Add Note'}
            </button>
          </div>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-gray-400">No notes yet.</p>
        ) : (() => {
          const [latest, ...older] = notes
          const NoteItem = ({ n }: { n: typeof notes[0] }) => (
            <li key={n.id} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{n.note_text}</p>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-gray-400">{n.author?.full_name ?? 'Unknown'} · {fmtTs(n.created_at)}</p>
                {confirmDeleteNote === n.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Delete?</span>
                    <button onClick={() => deleteNote(n.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                    <button onClick={() => setConfirmDeleteNote(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteNote(n.id)} title="Delete" className="text-gray-400 hover:text-red-600">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C9.327 4.025 9.66 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg>
                  </button>
                )}
              </div>
            </li>
          )
          return (
            <ul className="space-y-3">
              <NoteItem n={latest} />
              {older.length > 0 && (
                <>
                  <li>
                    <button
                      onClick={() => setShowHistoricalNotes(v => !v)}
                      className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors py-1"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${showHistoricalNotes ? 'rotate-180' : ''}`}
                      >
                        <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                      </svg>
                      {showHistoricalNotes ? 'Hide' : 'Show'} {older.length} previous {older.length === 1 ? 'note' : 'notes'}
                    </button>
                  </li>
                  {showHistoricalNotes && older.map(n => <NoteItem key={n.id} n={n} />)}
                </>
              )}
            </ul>
          )
        })()}
      </div>

      {/* Deal metadata */}
      <div className="mt-4 flex items-center gap-6 text-xs text-gray-400">
        {deal.created_at && <span>Created {fmtDate(deal.created_at.split('T')[0])}</span>}
        {deal.updated_at && <span>Updated {fmtDate(deal.updated_at.split('T')[0])}</span>}
        {deal.deal_owner && <span>Owner: {deal.deal_owner.full_name ?? '—'}</span>}
      </div>

      {/* Nav unsaved changes dialog */}
      {showNavWarning && (
        <UnsavedChangesDialog
          saving={navWarnSaving}
          onCancel={() => setShowNavWarning(false)}
          onDiscard={() => { setShowNavWarning(false); router.push(pendingNavRef.current ?? backHref) }}
          onSave={async () => {
            setNavWarnSaving(true)
            const ok = await saveDeal()
            setNavWarnSaving(false)
            if (ok) { setShowNavWarning(false); router.push(pendingNavRef.current ?? backHref) }
          }}
        />
      )}

      {/* Deal Details Modal */}
      {showDetailsModal && (
        <DealDetailsModal
          deal={deal}
          slackMemberId={deal.deal_owner?.slack_member_id}
          slackTeamId={SLACK_TEAM_ID}
          lastNoteDate={notes[0]?.created_at ?? null}
          recentNote={notes[0] ?? null}
          summary={detailsSummary}
          summaryGeneratedAt={detailsSummaryGeneratedAt}
          loadingSummary={loadingDetailsSummary}
          inspection={inspection}
          inspectionLoading={inspectionLoading}
          emailStatus={emailStatus}
          canViewAI={canViewAI}
          onClose={() => { setShowDetailsModal(false); setEmailStatus('idle') }}
          onRegenerateSummary={handleRegenerateSummary}
          onRunInspection={handleRunInspection}
          onEmailOwner={handleEmailOwner}
        />
      )}
    </div>
  )
}
