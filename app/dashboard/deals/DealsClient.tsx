'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { DealStage, DealWithRelations, NoteWithAuthor } from '@/lib/types'
import type { DealFormData, DealsInitialData, DealPageRow } from './types'
import type { InspectionResult } from '@/lib/deal-inspect'
import { DealDetailsModal } from './DealDetailsModal'
import { parseAmount, calcACV, calcTCV } from '@/lib/dealCalc'
import { formIsDirty } from '@/hooks/useUnsavedChanges'
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog'

const supabase = createClient()

const EMPTY_FORM: DealFormData = {
  deal_name: '', deal_description: '', account_id: '', stage_id: '',
  deal_owner_id: '', solutions_engineer_id: '', amount: '', contract_term_months: '', currency: 'USD', close_date: '',
  region: '', deal_type: '',
}

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20 text-sm'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function formatCurrency(v: number | null): string | null {
  if (v == null || isNaN(Number(v))) return null
  const n = Number(v)
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${n.toFixed(0)}`
}

function formatClose(d: string | null): string | null {
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

function stageHeaderClass(s: DealStage): string {
  if (s.is_lost) return 'text-red-500'
  if (s.is_won)  return 'text-green-600'
  if (s.sort_order <= 3) return 'text-gray-600'
  if (s.sort_order <= 5) return 'text-amber-600'
  return 'text-orange-600'
}

// ── State shape types ─────────────────────────────────────────────────────────

type FiltersState = {
  view:          'table' | 'kanban'
  search:        string
  filterStage:   string
  filterOwner:   string
  filterStale:   boolean
  filterOverdue: boolean
  sortCol:       string
  sortDir:       'asc' | 'desc'
}

type UIState = {
  modal:         'add' | null
  form:          DealFormData
  saving:        boolean
  formError:     string | null
  confirmDelete: string | null
}

function filtersFromSearchParams(params: URLSearchParams | ReturnType<typeof useSearchParams>): FiltersState {
  return {
    view:          params.get('view') === 'kanban' ? 'kanban' : 'table',
    search:        params.get('q') ?? '',
    filterStage:   params.get('stage') ?? '',
    filterOwner:   params.get('owner') ?? '',
    filterStale:   params.get('stale') === '1',
    filterOverdue: params.get('overdue') === '1',
    sortCol:       params.get('col') ?? '',
    sortDir:       params.get('dir') === 'desc' ? 'desc' : 'asc',
  }
}

const INITIAL_UI: UIState = {
  modal: null, form: EMPTY_FORM, saving: false, formError: null, confirmDelete: null,
}

export default function DealsClient({ initialData }: { initialData: DealsInitialData }) {

  // ── Data state ───────────────────────────────────────────────────────────────
  const [deals, setDeals]             = useState<DealWithRelations[]>(initialData.deals)
  const [lastNoteDates, setLastNoteDates] = useState<Map<string, string>>(
    () => new Map(Object.entries(initialData.lastNoteDates))
  )

  // ── UI state ─────────────────────────────────────────────────────────────────
  const searchParams = useSearchParams()
  const [filters, setFiltersState] = useState<FiltersState>(() => filtersFromSearchParams(searchParams))
  const [ui, setUIState]           = useState<UIState>(INITIAL_UI)

  // Destructure for readable access throughout the component
  const { view, search, filterStage, filterOwner, filterStale, filterOverdue, sortCol, sortDir } = filters
  const { modal, form, saving, formError, confirmDelete } = ui
  const isAllDeals = initialData.isAllDeals ?? false

  // ── Props-derived constants ──────────────────────────────────────────────────
  const stages             = initialData.stages
  const accounts           = initialData.accounts
  const profiles           = initialData.profiles
  const isAdmin            = initialData.currentUserRole === 'admin'
  const isSalesManager     = initialData.currentUserRole === 'sales_manager'
  const canViewAI          = isAdmin || isSalesManager
  const emailMap           = useMemo(() => new Map(Object.entries(initialData.emailMap)), [initialData.emailMap])
  const slackTeamId        = process.env.NEXT_PUBLIC_SLACK_TEAM_ID ?? ''
  const staleDaysThreshold   = initialData.staleDays
  // Clamp to a valid positive integer; fall back to 14 if config is missing/invalid
  const newDealDaysThreshold = Math.max(1, Math.round(Number(initialData.newDealDays) || 14))

  // ── Typed setter helpers ─────────────────────────────────────────────────────
  function setFilter<K extends keyof FiltersState>(key: K, value: FiltersState[K]) {
    setFiltersState(prev => ({ ...prev, [key]: value }))
  }
  function setUI<K extends keyof UIState>(key: K, value: UIState[K]) {
    setUIState(prev => ({ ...prev, [key]: value }))
  }

  const router = useRouter()

  // ── Sync filter state → URL query params (replace, not push) ─────────────────
  useEffect(() => {
    const p = new URLSearchParams()
    if (filters.search)        p.set('q',       filters.search)
    if (filters.filterStage)   p.set('stage',   filters.filterStage)
    if (filters.filterOwner)   p.set('owner',   filters.filterOwner)
    if (filters.filterStale)   p.set('stale',   '1')
    if (filters.filterOverdue) p.set('overdue', '1')
    if (filters.sortCol)       p.set('col',     filters.sortCol)
    if (filters.sortDir !== 'asc') p.set('dir', filters.sortDir)
    if (filters.view !== 'table')  p.set('view', filters.view)
    const qs = p.toString()
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false })
  }, [filters, router])

  // ── Add Deal dirty tracking ──────────────────────────────────────────────────
  const addDealInitialRef = useRef<DealFormData | null>(null)
  const [showAddDealWarning, setShowAddDealWarning] = useState(false)
  const isAddDealDirty = modal === 'add' && formIsDirty(form, addDealInitialRef.current)

  // ── Feedback modal state ─────────────────────────────────────────────────────
  const [feedbackDeal,              setFeedbackDeal]              = useState<DealWithRelations | null>(null)
  const [feedbackNote,              setFeedbackNote]              = useState<NoteWithAuthor | null>(null)
  const [feedbackSummary,           setFeedbackSummary]           = useState<string | null>(null)
  const [feedbackSummaryGeneratedAt,setFeedbackSummaryGeneratedAt]= useState<string | null>(null)
  const [loadingFeedbackSummary,    setLoadingFeedbackSummary]    = useState(false)
  const [inspection,                setInspection]                = useState<InspectionResult | null>(null)
  const [inspectionLoading,         setInspectionLoading]         = useState(false)
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'summarizing' | 'inspecting' | 'emailing'>('idle')

  // ── Reset / close helpers ────────────────────────────────────────────────────
  function closeModal() {
    if (isAddDealDirty) { setShowAddDealWarning(true); return }
    forceCloseModal()
  }

  function forceCloseModal() {
    setUIState(prev => ({ ...prev, modal: null, formError: null, form: EMPTY_FORM }))
    addDealInitialRef.current = null
    setShowAddDealWarning(false)
  }

  // ── Data refresh (post-mutation) ─────────────────────────────────────────────
  async function fetchDeals() {
    const { data, error } = await supabase.rpc('get_deals_page', {
      p_stale_days:  staleDaysThreshold,
      p_active_only: !isAllDeals,
    })
    if (error) { console.error('deals fetch:', error.message); return }
    const rpcRows = (data ?? []) as DealPageRow[]
    setDeals(rpcRows.map(row => ({
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
      deal_owner:         row.deal_owner_name ? { full_name: row.deal_owner_name } : null,
      solutions_engineer: row.se_name         ? { full_name: row.se_name }         : null,
    })) as DealWithRelations[])
  }

  async function fetchLastNoteDates() {
    const { data } = await supabase
      .from('notes')
      .select('entity_id, created_at')
      .eq('entity_type', 'deal')
      .order('created_at', { ascending: false })
    const map = new Map<string, string>()
    for (const n of data ?? []) {
      if (!map.has(n.entity_id)) map.set(n.entity_id, n.created_at)
    }
    setLastNoteDates(map)
  }

  // ── Stage change ─────────────────────────────────────────────────────────────
  async function changeStage(deal: DealWithRelations, newStageId: string) {
    if (!newStageId || newStageId === deal.stage_id) return
    const { data: { user: u } } = await supabase.auth.getUser()
    const now = new Date().toISOString()
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('deals').update({ stage_id: newStageId, last_activity_at: now }).eq('id', deal.id),
      supabase.from('deal_stage_history').insert({ deal_id: deal.id, from_stage_id: deal.stage_id, to_stage_id: newStageId, changed_by: u!.id }),
    ])
    if (e1) console.error('stage update:', e1.message)
    if (e2) console.error('history insert:', e2.message)
    fetchDeals()
  }

  // ── Deal modal helpers ────────────────────────────────────────────────────────
  function openAdd(stageId = '') {
    const initialForm = { ...EMPTY_FORM, stage_id: stageId || (stages[1]?.id ?? '') }
    setUIState(prev => ({
      ...prev,
      form: initialForm,
      formError: null, modal: 'add',
    }))
    addDealInitialRef.current = initialForm
  }

  // ── Deal CRUD ────────────────────────────────────────────────────────────────
  function set(field: keyof DealFormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setUIState(prev => ({ ...prev, form: { ...prev.form, [field]: e.target.value } }))
  }

  async function handleSave() {
    setUIState(prev => ({ ...prev, saving: true, formError: null }))
    const { data: { user: u } } = await supabase.auth.getUser()
    const amountNum = parseAmount(form.amount)
    const termNum   = Math.max(0, Math.floor(parseFloat(form.contract_term_months) || 0))
    const payload = {
      deal_name:             form.deal_name.trim(),
      deal_description:      form.deal_description.trim() || null,
      account_id:            form.account_id   || null,
      stage_id:              form.stage_id,
      amount:                amountNum > 0 ? amountNum : null,
      contract_term_months:  termNum   > 0 ? termNum   : null,
      value_amount:          amountNum > 0 ? calcACV(form.amount, form.contract_term_months) : null,
      total_contract_value:  amountNum > 0 && termNum > 0 ? amountNum * termNum : null,
      currency:              form.currency || 'USD',
      close_date:            form.close_date || null,
      solutions_engineer_id: form.solutions_engineer_id || null,
      region:                form.region || null,
      deal_type:             form.deal_type || null,
    }
    const { data: inserted, error } = await supabase.from('deals').insert({ ...payload, deal_owner_id: u!.id }).select('id').single()
    if (error) {
      setUI('formError', error.message)
    } else {
      forceCloseModal()
      router.push(`/dashboard/deals/${inserted.id}?back=${encodeURIComponent(window.location.pathname + window.location.search)}`)
    }
    setUI('saving', false)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('deals').delete().eq('id', id)
    if (error) console.error('delete deal:', error.message)
    else setDeals(prev => prev.filter(d => d.id !== id))
    setUI('confirmDelete', null)
  }

  // ── Feedback modal ───────────────────────────────────────────────────────────

  async function openFeedback(deal: DealWithRelations) {
    setFeedbackDeal(deal)
    setFeedbackNote(null)
    setFeedbackSummary(null)
    setFeedbackSummaryGeneratedAt(null)
    setInspection(null)
    setEmailStatus('idle')
    // Load most recent note
    supabase.from('notes')
      .select('*, author:profiles!created_by(full_name)')
      .eq('entity_type', 'deal')
      .eq('entity_id', deal.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => { if (data?.[0]) setFeedbackNote(data[0] as NoteWithAuthor) })
    // Load stored summary & inspection (non-blocking)
    if (canViewAI) {
      fetch(`/api/deals/${deal.id}/summarize`).then(async r => {
        if (r.ok) { const b = await r.json(); if (b.summary) { setFeedbackSummary(b.summary); setFeedbackSummaryGeneratedAt(b.generatedAt ?? null) } }
      }).catch(() => {})
      fetch(`/api/deals/${deal.id}/inspect`).then(async r => {
        if (r.ok) { const b = await r.json(); if (b.result) setInspection(b.result as InspectionResult) }
      }).catch(() => {})
    }
  }

  function closeFeedback() { setFeedbackDeal(null); setEmailStatus('idle') }

  async function handleRegenerateSummary() {
    if (!feedbackDeal) return
    setLoadingFeedbackSummary(true)
    try {
      const res = await fetch(`/api/deals/${feedbackDeal.id}/summarize`, { method: 'POST' })
      const body = await res.json()
      if (res.ok) { setFeedbackSummary(body.summary); setFeedbackSummaryGeneratedAt(body.generatedAt ?? null) }
    } finally { setLoadingFeedbackSummary(false) }
  }

  async function handleRunInspection() {
    if (!feedbackDeal) return
    setInspectionLoading(true)
    try {
      const res = await fetch(`/api/deals/${feedbackDeal.id}/inspect`, { method: 'POST' })
      if (res.ok) { const data = await res.json(); if (data.result) setInspection(data.result as InspectionResult) }
    } catch (_e) { /* silent */ }
    setInspectionLoading(false)
  }

  async function handleEmailOwner() {
    if (!feedbackDeal) return
    const ownerEmail = emailMap.get(feedbackDeal.deal_owner_id) ?? ''
    setEmailStatus('checking')
    if (!feedbackSummary) {
      setEmailStatus('summarizing')
      try {
        const res = await fetch(`/api/deals/${feedbackDeal.id}/summarize`, { method: 'POST' })
        if (res.ok) { const b = await res.json(); if (b.summary) { setFeedbackSummary(b.summary); setFeedbackSummaryGeneratedAt(b.generatedAt ?? null) } }
      } catch (_e) { /* continue */ }
    }
    if (!inspection) {
      setEmailStatus('inspecting')
      try {
        const res = await fetch(`/api/deals/${feedbackDeal.id}/inspect`, { method: 'POST' })
        if (res.ok) { const data = await res.json(); if (data.result) setInspection(data.result as InspectionResult) }
      } catch (_e) { /* fallback */ }
    }
    setEmailStatus('emailing')
    try {
      const res = await fetch(`/api/deals/${feedbackDeal.id}/compose-email`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.subject && data.body) {
          if (data.inspection) setInspection(data.inspection as InspectionResult)
          window.open(`mailto:${ownerEmail}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(data.body)}`, '_blank')
          setEmailStatus('idle'); return
        }
      }
    } catch (_e) { /* fallback */ }
    const stageName = feedbackDeal.deal_stages?.stage_name ?? 'unknown stage'
    const ownerName = feedbackDeal.deal_owner?.full_name ?? 'there'
    const fallbackSubject = `Deal Update: ${feedbackDeal.deal_name}`
    const fallbackBody = `Hi ${ownerName},\n\nI wanted to follow up on "${feedbackDeal.deal_name}" (${stageName}).\n\nCould you please provide a current status update and flag any blockers?\n\nThanks.`
    window.open(`mailto:${ownerEmail}?subject=${encodeURIComponent(fallbackSubject)}&body=${encodeURIComponent(fallbackBody)}`, '_blank')
    setEmailStatus('idle')
  }

  // ── Sort ─────────────────────────────────────────────────────────────────────
  function toggleSort(col: string) {
    setFiltersState(prev => ({
      ...prev,
      sortCol: col,
      sortDir: prev.sortCol === col ? (prev.sortDir === 'asc' ? 'desc' : 'asc') : 'asc',
    }))
  }

  // ── Derived data (memoized) ──────────────────────────────────────────────────
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])

  const filtered = useMemo(() =>
    deals.filter(d => {
      if (!isAllDeals && d.deal_stages?.is_closed) return false
      const q = search.toLowerCase()
      const matchSearch = !q || d.deal_name.toLowerCase().includes(q) || (d.accounts?.account_name ?? '').toLowerCase().includes(q)
      const matchStage  = !filterStage || d.stage_id === filterStage
      return matchSearch && matchStage
    }),
    [deals, search, filterStage, isAllDeals]
  )

  const displayDeals = useMemo(() =>
    filtered
      .filter(d => !filterOwner || d.deal_owner_id === filterOwner)
      .filter(d => {
        if (!filterStale) return true
        const ts = lastNoteDates.get(d.id)
        return ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) >= staleDaysThreshold : false
      })
      .filter(d => !filterOverdue || (!!d.close_date && d.close_date < todayStr && !d.deal_stages?.is_closed)),
    [filtered, filterOwner, filterStale, filterOverdue, lastNoteDates, staleDaysThreshold, todayStr]
  )

  const sorted = useMemo(() => {
    if (!sortCol) return displayDeals
    function getSortVal(d: DealWithRelations): string | number | null {
      switch (sortCol) {
        case 'deal':     return d.deal_name
        case 'account':  return d.accounts?.account_name ?? null
        case 'stage':    return d.deal_stages?.sort_order ?? null
        case 'acv':      return d.value_amount ?? null
        case 'close':    return d.close_date ?? null
        case 'owner':    return d.deal_owner?.full_name ?? null
        case 'se':       return d.solutions_engineer?.full_name ?? null
        case 'modified': return lastNoteDates.get(d.id) ?? null
        case 'days':     return lastNoteDates.get(d.id) ? Math.floor((Date.now() - new Date(lastNoteDates.get(d.id)!).getTime()) / 86400000) : null
        case 'health':   return d.health_score ?? null
        default:         return null
      }
    }
    return [...displayDeals].sort((a, b) => {
      const va = getSortVal(a), vb = getSortVal(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1; if (vb == null) return -1
      const r = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sortDir === 'asc' ? r : -r
    })
  }, [displayDeals, sortCol, sortDir, lastNoteDates])

  const metrics = useMemo(() => {
    const nowMs        = Date.now()
    const openDisplay  = displayDeals.filter(d => !d.deal_stages?.is_closed)
    const totalACV     = openDisplay.reduce((s, d) => s + (d.value_amount ?? 0), 0)
    const noteDays     = displayDeals
      .map(d => { const ts = lastNoteDates.get(d.id); return ts ? Math.floor((nowMs - new Date(ts).getTime()) / 86400000) : null })
      .filter((x): x is number => x !== null)
    const avgDays      = noteDays.length ? Math.round(noteDays.reduce((a, b) => a + b, 0) / noteDays.length) : null
    const staleCount   = noteDays.filter(d => d >= staleDaysThreshold).length
    const overdueCount = displayDeals.filter(d => d.close_date && d.close_date < todayStr && !d.deal_stages?.is_closed).length
    const healthScores = displayDeals.map(d => d.health_score).filter((x): x is number => x != null)
    const avgHealth    = healthScores.length ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : null
    return { totalACV, avgDays, staleCount, overdueCount, avgHealth }
  }, [displayDeals, lastNoteDates, staleDaysThreshold, todayStr])

  const { totalACV, avgDays, staleCount, overdueCount, avgHealth } = metrics

  const ownerSummaries = useMemo(() => {
    type OwnerSummary = { id: string; name: string; count: number; acv: number; avgDays: number | null; overdue: number }
    const nowMs = Date.now()
    // Always exclude closed-stage deals from owner summary cards
    const activeFiltered = filtered.filter(d => !d.deal_stages?.is_closed)
    const ownerMap = new Map<string, OwnerSummary>()
    for (const d of activeFiltered) {
      const oid = d.deal_owner_id
      const cur = ownerMap.get(oid) ?? { id: oid, name: d.deal_owner?.full_name ?? 'Unknown', count: 0, acv: 0, avgDays: null, overdue: 0 }
      cur.count++
      cur.acv += d.value_amount ?? 0
      if (d.close_date && d.close_date < todayStr) cur.overdue++
      ownerMap.set(oid, cur)
    }
    for (const [oid, ownerSummary] of ownerMap) {
      const ownerDays = activeFiltered
        .filter(d => d.deal_owner_id === oid)
        .map(d => { const ts = lastNoteDates.get(d.id); return ts ? Math.floor((nowMs - new Date(ts).getTime()) / 86400000) : null })
        .filter((x): x is number => x !== null)
      ownerSummary.avgDays = ownerDays.length ? Math.round(ownerDays.reduce((a, b) => a + b, 0) / ownerDays.length) : null
    }
    return [...ownerMap.values()].sort((a, b) => b.acv - a.acv)
  }, [filtered, lastNoteDates, todayStr])

  const byStage    = (sid: string) => displayDeals.filter(d => d.stage_id === sid)
  const stageTotal = (sid: string) => { const t = byStage(sid).reduce((s, d) => s + (d.value_amount != null ? Number(d.value_amount) : 0), 0); return t > 0 ? formatCurrency(t) : null }

  // ── Sort header component ────────────────────────────────────────────────────
  function Th({ col, label }: { col: string; label: string }) {
    const active = sortCol === col
    return (
      <th onClick={() => toggleSort(col)} className="px-4 py-3 text-xs font-medium text-white uppercase tracking-wider cursor-pointer select-none hover:text-white/80 text-left">
        {label}<span className={`ml-1 ${active ? 'text-white' : 'text-white/40'}`}>{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </th>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-900">{isAllDeals ? 'All Deals' : 'Deals'}</h2>
          {isAllDeals
            ? <Link href="/dashboard/deals" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Active Deals</Link>
            : <Link href="/dashboard/deals/all" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">All Deals →</Link>
          }
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setFilter('view', 'table')} className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Table</button>
            <button onClick={() => setFilter('view', 'kanban')} className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${view === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Kanban</button>
          </div>
          <Link href="/dashboard/deals/import" className="text-sm text-[#00ADB1] hover:text-[#00989C] font-medium border border-[#00ADB1] bg-[#E6F7F8] hover:bg-[#D2F0F2] px-3 py-2 rounded-lg transition-colors">Import CSV</Link>
          <button onClick={() => openAdd()} className="bg-[#00ADB1] hover:bg-[#00989C] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ New deal</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <input type="text" placeholder="Search deals…" value={search} onChange={e => setFilter('search', e.target.value)} className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20 w-64" />
        <select value={filterStage} onChange={e => setFilter('filterStage', e.target.value)} className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20">
          <option value="">All stages</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
        </select>
        {(search || filterStage) && <button onClick={() => setFiltersState(prev => ({ ...prev, search: '', filterStage: '' }))} className="text-sm text-gray-400 hover:text-gray-600">Clear</button>}
        {(search || filterStage || filterOwner) && <span className="text-sm text-gray-400">{displayDeals.length} of {deals.length}</span>}
      </div>

      {/* Summary cards */}
      {deals.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Total Deals</p>
              <p className="text-2xl font-bold text-gray-900">{displayDeals.length}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Pipeline ACV</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalACV) ?? '—'}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Avg Days Since Update</p>
              <p className="text-2xl font-bold text-gray-900">{avgDays ?? '—'}</p>
            </div>
            <button onClick={() => setFilter('filterStale', !filterStale)} className={`text-left border border-gray-200 border-l-4 border-l-amber-400 rounded-xl p-4 shadow-sm transition-colors ${filterStale ? 'bg-amber-50 ring-2 ring-amber-300' : 'bg-white hover:bg-amber-50'}`}>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Stale ({staleDaysThreshold}+ days)</p>
              <p className="text-2xl font-bold text-gray-900">{staleCount}</p>
            </button>
            <button onClick={() => setFilter('filterOverdue', !filterOverdue)} className={`text-left border border-gray-200 border-l-4 border-l-red-400 rounded-xl p-4 shadow-sm transition-colors ${filterOverdue ? 'bg-red-50 ring-2 ring-red-300' : 'bg-white hover:bg-red-50'}`}>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Overdue</p>
              <p className="text-2xl font-bold text-gray-900">{overdueCount}</p>
            </button>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Avg Health Score</p>
              <p className="text-2xl font-bold text-gray-900">{avgHealth ?? '—'}</p>
            </div>
          </div>

          {ownerSummaries.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
              {ownerSummaries.map(o => (
                <button key={o.id} onClick={() => setFilter('filterOwner', filterOwner === o.id ? '' : o.id)} className={`text-left bg-white border rounded-xl p-4 shadow-sm transition-colors ${filterOwner === o.id ? 'border-l-4 border-[#00ADB1] bg-[#E6F7F8]' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className="font-medium text-gray-900 text-sm mb-2 truncate">{o.name}</p>
                  <div className="grid grid-cols-4 gap-1 text-center">
                    <div><p className="text-base font-bold text-gray-900">{o.count}</p><p className="text-xs text-gray-400">Deals</p></div>
                    <div><p className="text-base font-bold text-gray-900">{formatCurrency(o.acv) ?? '—'}</p><p className="text-xs text-gray-400">ACV</p></div>
                    <div><p className="text-base font-bold text-gray-900">{o.avgDays ?? '—'}</p><p className="text-xs text-gray-400">Avg Days</p></div>
                    <div><p className={`text-base font-bold ${o.overdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>{o.overdue}</p><p className="text-xs text-gray-400">Overdue</p></div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {(filterOwner || filterStale || filterOverdue) && (
            <div className="flex items-center gap-3 mb-3">
              {filterOwner   && <button onClick={() => setFilter('filterOwner', '')}     className="text-xs text-gray-400 hover:text-gray-600">✕ Clear owner filter</button>}
              {filterStale   && <button onClick={() => setFilter('filterStale', false)}  className="text-xs text-amber-600 hover:text-amber-800">✕ Clear stale filter</button>}
              {filterOverdue && <button onClick={() => setFilter('filterOverdue', false)} className="text-xs text-red-600 hover:text-red-800">✕ Clear overdue filter</button>}
            </div>
          )}
        </>
      )}

      {view === 'table' ? (
        displayDeals.length === 0 ? (
          <p className="text-gray-500 text-sm">No deals match your filters.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200" style={{ backgroundColor: '#00ADB1' }}>
                  <Th col="deal" label="Deal Name" /><Th col="owner" label="Deal Owner" /><Th col="stage" label="Stage" />
                  <Th col="acv" label="ACV (CAD)" /><Th col="close" label="Close Date" /><Th col="modified" label="Modified Date" />
                  <Th col="days" label="Days Since" /><Th col="health" label="Health" />
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(deal => (
                  <tr key={deal.id} className="hover:bg-[#E6F7F8] transition-colors">
                    <td className="px-4 py-3.5 font-medium text-gray-900 max-w-[220px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button onClick={() => router.push(`/dashboard/deals/${deal.id}?back=${encodeURIComponent(window.location.pathname + window.location.search)}`)} title={deal.deal_name} className="truncate text-left hover:text-[#00ADB1] transition-colors">{deal.deal_name}</button>

                        {(() => {
                          if (!deal.created_at) return false
                          const ms = new Date(deal.created_at).getTime()
                          if (!isFinite(ms)) return false
                          const daysAgo = (Date.now() - ms) / 86400000
                          return daysAgo >= 0 && daysAgo < newDealDaysThreshold
                        })() && (
                          <span className="shrink-0 inline-flex px-1.5 py-0 rounded text-xs font-medium bg-[#E6F7F8] text-[#00ADB1] ring-1 ring-[#00ADB1]/30">New</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">{deal.deal_owner?.full_name ?? '—'}</td>
                    <td className="px-4 py-3.5">
                      <select value={deal.stage_id} onChange={e => changeStage(deal, e.target.value)} className={`text-xs font-medium px-2 py-1 rounded-md border-0 focus:outline-none focus:ring-2 focus:ring-[#00ADB1]/30 cursor-pointer ${stageBadgeClass(deal.deal_stages)}`}>
                        {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3.5 text-gray-700 font-medium">{formatCurrency(deal.value_amount) ?? '—'}</td>
                    <td className="px-4 py-3.5 text-xs">
                      {(() => {
                        const isOverdue = deal.close_date && deal.close_date < todayStr && !deal.deal_stages?.is_closed
                        if (!deal.close_date) return <span className="text-gray-400">—</span>
                        if (isOverdue) return <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 font-semibold px-2 py-0.5 rounded-full ring-1 ring-red-300">{formatClose(deal.close_date)} <span className="font-normal">Overdue</span></span>
                        return <span className="text-gray-500">{formatClose(deal.close_date)}</span>
                      })()}
                    </td>
                    <td className="px-4 py-3.5 text-gray-400 text-xs">{(() => { const ts = lastNoteDates.get(deal.id); return ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—' })()}</td>
                    <td className="px-4 py-3.5 text-xs">
                      {(() => {
                        const ts = lastNoteDates.get(deal.id)
                        if (!ts) return <span className="text-gray-400">—</span>
                        const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
                        if (days >= staleDaysThreshold) return <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded-full ring-1 ring-amber-300">{days} <span className="font-normal">Stale</span></span>
                        return <span className="text-gray-400">{days}</span>
                      })()}
                    </td>
                    <td className="px-4 py-3.5">
                      {deal.health_score != null
                        ? <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold ${healthBadgeClass(deal.health_score)}`}>{deal.health_score}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3 justify-end">
                        {isAdmin && confirmDelete === deal.id ? (
                          <>
                            <span className="text-xs text-gray-400">Delete?</span>
                            <button onClick={() => handleDelete(deal.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                            <button onClick={() => setUI('confirmDelete', null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                          </>
                        ) : (
                          <>
                            {isAdmin &&<button onClick={() => setUI('confirmDelete', deal.id)} title="Delete" className="text-gray-500 hover:text-red-600"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C9.327 4.025 9.66 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg></button>}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        // ── Kanban view ──────────────────────────────────────────────────────────
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3" style={{ minWidth: `${stages.length * 220 + (stages.length - 1) * 12}px` }}>
            {stages.map(stage => {
              const stageDeals = byStage(stage.id)
              const total = stageTotal(stage.id)
              return (
                <div key={stage.id} className="flex flex-col w-52 flex-shrink-0">
                  <div className="mb-3 px-1">
                    <div className="flex items-baseline justify-between">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${stageHeaderClass(stage)}`}>{stage.stage_name}</span>
                      <span className="text-xs text-gray-400">{stageDeals.length}</span>
                    </div>
                    {total && <p className="text-xs text-gray-400 mt-0.5">{total}</p>}
                  </div>
                  <div className="flex-1 space-y-2">
                    {stageDeals.map(deal => (
                      <div key={deal.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900 leading-snug">{deal.deal_name}</p>
                          {deal.health_score != null && <span className={`flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded ${healthBadgeClass(deal.health_score)}`}>{deal.health_score}</span>}
                        </div>
                        {deal.accounts && <p className="text-xs text-gray-500 mt-1">{deal.accounts.account_name}</p>}
                        {deal.solutions_engineer?.full_name && <p className="text-xs text-[#00ADB1] mt-0.5">SE: {deal.solutions_engineer.full_name}</p>}
                        {(deal.value_amount != null || deal.close_date) && (
                          <div className="flex items-center gap-3 mt-2">
                            {deal.value_amount != null && <span className="text-xs text-gray-700 font-medium">{formatCurrency(deal.value_amount)}</span>}
                            {deal.close_date && <span className="text-xs text-gray-400">{formatClose(deal.close_date)}</span>}
                          </div>
                        )}
                        <div className="mt-2">
                          <select value={deal.stage_id} onChange={e => changeStage(deal, e.target.value)} className="w-full text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#00ADB1]/30">
                            {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                          {isAdmin && confirmDelete === deal.id ? (
                            <><span className="text-xs text-gray-400">Delete?</span><button onClick={() => handleDelete(deal.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button><button onClick={() => setUI('confirmDelete', null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button></>
                          ) : (
                            <><button onClick={() => router.push(`/dashboard/deals/${deal.id}?back=${encodeURIComponent(window.location.pathname + window.location.search)}`)} className="text-xs text-gray-500 hover:text-gray-700">View</button>{isAdmin && <button onClick={() => setUI('confirmDelete', deal.id)} className="text-xs text-gray-500 hover:text-red-600">Delete</button>}</>
                          )}
                        </div>
                      </div>
                    ))}
                    <button onClick={() => openAdd(stage.id)} className="w-full text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 hover:border-gray-400 rounded-xl py-2 transition-colors bg-white/50">+ Add</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Deal Details modal */}
      {feedbackDeal && (
        <DealDetailsModal
          deal={feedbackDeal}
          slackMemberId={profiles.find(p => p.id === feedbackDeal.deal_owner_id)?.slack_member_id}
          slackTeamId={slackTeamId}
          lastNoteDate={lastNoteDates.get(feedbackDeal.id) ?? null}
          recentNote={feedbackNote}
          summary={feedbackSummary}
          summaryGeneratedAt={feedbackSummaryGeneratedAt}
          loadingSummary={loadingFeedbackSummary}
          inspection={inspection}
          inspectionLoading={inspectionLoading}
          emailStatus={emailStatus}
          canViewAI={canViewAI}
          onClose={closeFeedback}
          onRegenerateSummary={handleRegenerateSummary}
          onRunInspection={handleRunInspection}
          onEmailOwner={handleEmailOwner}
        />
      )}

      {/* Add Deal modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 bg-[#00ADB1] rounded-t-xl">
              <h3 className="font-semibold text-white">New Deal</h3>
              <button onClick={closeModal} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <Field label="Deal name *"><input type="text" value={form.deal_name} onChange={set('deal_name')} className={INPUT} /></Field>
              <Field label="Description"><textarea value={form.deal_description} onChange={set('deal_description')} rows={2} placeholder="Optional description…" className={`${INPUT} resize-none`} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Account">
                  <div className="flex items-center gap-2">
                    <select value={form.account_id} onChange={set('account_id')} className={`${INPUT} flex-1`}>
                      <option value="">— none —</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                    </select>
                    {form.account_id && (
                      <Link
                        href={`/dashboard/accounts/${form.account_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open account"
                        className="shrink-0 text-gray-400 hover:text-[#00ADB1] transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" /><path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" /></svg>
                      </Link>
                    )}
                  </div>
                </Field>
                <Field label="Stage">
                  <select value={form.stage_id} onChange={set('stage_id')} className={INPUT}>
                    <option value="">— select —</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Solutions Engineer">
                <select value={form.solutions_engineer_id} onChange={set('solutions_engineer_id')} className={INPUT}>
                  <option value="">— none —</option>
                  {profiles.filter(p => p.role === 'solutions_engineer').map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Amount"><div className="relative"><span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm pointer-events-none">$</span><input type="text" value={form.amount} onChange={set('amount')} placeholder="0" className={`${INPUT} pl-6`} /></div></Field>
                <Field label="Currency">
                  <select value={form.currency} onChange={set('currency')} className={INPUT}>
                    <option value="USD">USD</option><option value="CAD">CAD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="MXN">MXN</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Contract Term (months)"><input type="number" min="1" step="1" value={form.contract_term_months} onChange={set('contract_term_months')} placeholder="" className={INPUT} /></Field>
                <Field label="Close date"><input type="date" value={form.close_date} onChange={set('close_date')} className={INPUT} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="ACV (auto)">
                  <p className={`${INPUT} bg-gray-50 text-gray-600 cursor-default`}>{form.amount ? (formatCurrency(calcACV(form.amount, form.contract_term_months)) ?? '—') : '—'}</p>
                </Field>
                <Field label="Total Contract Value (auto)">
                  <p className={`${INPUT} bg-gray-50 text-gray-600 cursor-default`}>{form.amount && form.contract_term_months ? (formatCurrency(calcTCV(form.amount, form.contract_term_months)) ?? '—') : '—'}</p>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Region">
                  <select value={form.region} onChange={set('region')} className={INPUT}>
                    <option value="">— none —</option>
                    <option value="North America">North America</option>
                    <option value="Europe/Asia/Pacific/Africa">Europe/Asia/Pacific/Africa</option>
                    <option value="Latin America/Caribbean">Latin America/Caribbean</option>
                  </select>
                </Field>
                <Field label="Type of Deal">
                  <select value={form.deal_type} onChange={set('deal_type')} className={INPUT}>
                    <option value="">— none —</option>
                    <option value="Migration">Migration</option>
                    <option value="Organic One-Time">Organic One-Time</option>
                    <option value="Organic Recurring">Organic Recurring</option>
                    <option value="Pro Services">Pro Services</option>
                  </select>
                </Field>
              </div>
              {formError && <p className="text-red-600 text-sm font-medium">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={closeModal} className="text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.deal_name.trim() || !form.stage_id} className="bg-[#00ADB1] hover:bg-[#00989C] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            {showAddDealWarning && (
              <UnsavedChangesDialog
                onCancel={() => setShowAddDealWarning(false)}
                onDiscard={forceCloseModal}
                onSave={async () => { await handleSave(); setShowAddDealWarning(false) }}
                saving={saving}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
