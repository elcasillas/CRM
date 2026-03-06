'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { DealStage, DealWithRelations, NoteWithAuthor } from '@/lib/types'
import type { DealFormData, DealsInitialData } from './types'
import { parseAmount, calcACV, calcTCV } from '@/lib/dealCalc'

const supabase = createClient()

const EMPTY_FORM: DealFormData = {
  deal_name: '', deal_description: '', account_id: '', stage_id: '',
  deal_owner_id: '', solutions_engineer_id: '', amount: '', contract_term_months: '', currency: 'USD', close_date: '',
}

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm'

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
  modal:                       'add' | 'edit' | null
  editing:                     DealWithRelations | null
  form:                        DealFormData
  saving:                      boolean
  formError:                   string | null
  confirmDelete:                string | null
  feedbackDeal:                DealWithRelations | null
  feedbackSummary:             string | null
  feedbackSummaryGeneratedAt:  string | null
  loadingFeedbackSummary:      boolean
  copied:                      boolean
}

type NotesState = {
  dealNotes:         NoteWithAuthor[]
  noteText:          string
  loggingNote:       boolean
  noteConfirmDelete: string | null
  feedbackNotes:     NoteWithAuthor[]
}

const INITIAL_FILTERS: FiltersState = {
  view: 'table', search: '', filterStage: '', filterOwner: '',
  filterStale: false, filterOverdue: false, sortCol: '', sortDir: 'asc',
}

const INITIAL_UI: UIState = {
  modal: null, editing: null, form: EMPTY_FORM, saving: false,
  formError: null, confirmDelete: null, feedbackDeal: null,
  feedbackSummary: null, feedbackSummaryGeneratedAt: null, loadingFeedbackSummary: false, copied: false,
}

const INITIAL_NOTES: NotesState = {
  dealNotes: [], noteText: '', loggingNote: false, noteConfirmDelete: null, feedbackNotes: [],
}

export default function DealsClient({ initialData }: { initialData: DealsInitialData }) {

  // ── Data state ───────────────────────────────────────────────────────────────
  const [deals, setDeals]             = useState<DealWithRelations[]>(initialData.deals)
  const [lastNoteDates, setLastNoteDates] = useState<Map<string, string>>(
    () => new Map(Object.entries(initialData.lastNoteDates))
  )

  // ── UI state (3 grouped hooks) ───────────────────────────────────────────────
  const [filters, setFiltersState] = useState<FiltersState>(INITIAL_FILTERS)
  const [ui, setUIState]           = useState<UIState>(INITIAL_UI)
  const [notes, setNotesState]     = useState<NotesState>(INITIAL_NOTES)

  // Destructure for readable access throughout the component
  const { view, search, filterStage, filterOwner, filterStale, filterOverdue, sortCol, sortDir } = filters
  const { modal, editing, form, saving, formError, confirmDelete,
          feedbackDeal, feedbackSummary, feedbackSummaryGeneratedAt, loadingFeedbackSummary, copied } = ui
  const { dealNotes, noteText, loggingNote, noteConfirmDelete, feedbackNotes } = notes

  // ── Props-derived constants ──────────────────────────────────────────────────
  const stages             = initialData.stages
  const accounts           = initialData.accounts
  const profiles           = initialData.profiles
  const isAdmin            = initialData.currentUserRole === 'admin'
  const isSalesManager     = initialData.currentUserRole === 'sales_manager'
  const userId             = initialData.currentUserId
  const staleDaysThreshold   = initialData.staleDays
  // Clamp to a valid positive integer; fall back to 14 if config is missing/invalid
  const newDealDaysThreshold = Math.max(1, Math.round(Number(initialData.newDealDays) || 14))
  const emailMap           = useMemo(
    () => new Map(Object.entries(initialData.emailMap)),
    [initialData.emailMap]
  )

  // ── Typed setter helpers ─────────────────────────────────────────────────────
  function setFilter<K extends keyof FiltersState>(key: K, value: FiltersState[K]) {
    setFiltersState(prev => ({ ...prev, [key]: value }))
  }
  function setUI<K extends keyof UIState>(key: K, value: UIState[K]) {
    setUIState(prev => ({ ...prev, [key]: value }))
  }
  function setNotesUI<K extends keyof NotesState>(key: K, value: NotesState[K]) {
    setNotesState(prev => ({ ...prev, [key]: value }))
  }

  // ── Reset / close helpers ────────────────────────────────────────────────────
  function resetDealForm() {
    setUIState(prev => ({ ...prev, form: EMPTY_FORM, formError: null }))
  }
  function resetNotesForm() {
    setNotesState(prev => ({ ...prev, dealNotes: [], noteText: '', noteConfirmDelete: null }))
  }
  function closeModal() {
    setUIState(prev => ({ ...prev, modal: null, editing: null, formError: null, form: EMPTY_FORM }))
    resetNotesForm()
  }
  function closeFeedback() {
    setUIState(prev => ({ ...prev, feedbackDeal: null, feedbackSummary: null, feedbackSummaryGeneratedAt: null, loadingFeedbackSummary: false }))
    setNotesState(prev => ({ ...prev, feedbackNotes: [] }))
  }
  function closeAllModals() { closeModal(); closeFeedback() }

  // ── Data refresh (post-mutation) ─────────────────────────────────────────────
  async function fetchDeals() {
    const { data, error } = await supabase
      .from('deals')
      .select('*, accounts(account_name), deal_stages(stage_name, sort_order, is_closed, is_won, is_lost), deal_owner:profiles!deal_owner_id(full_name), solutions_engineer:profiles!solutions_engineer_id(full_name)')
      .order('last_activity_at', { ascending: false, nullsFirst: false })
    if (error) console.error('deals fetch:', error.message)
    else setDeals((data ?? []) as DealWithRelations[])
  }

  async function fetchDealNotes(dealId: string) {
    const { data } = await supabase
      .from('notes')
      .select('*, author:profiles!created_by(full_name)')
      .eq('entity_type', 'deal')
      .eq('entity_id', dealId)
      .order('created_at', { ascending: false })
    setNotesUI('dealNotes', (data ?? []) as NoteWithAuthor[])
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
    setUIState(prev => ({
      ...prev,
      form: { ...EMPTY_FORM, stage_id: stageId || (stages[1]?.id ?? '') },
      editing: null, formError: null, modal: 'add',
    }))
  }

  function openEdit(deal: DealWithRelations) {
    setUIState(prev => ({
      ...prev,
      form: {
        deal_name:             deal.deal_name,
        deal_description:      deal.deal_description ?? '',
        account_id:            deal.account_id ?? '',
        stage_id:              deal.stage_id,
        deal_owner_id:         deal.deal_owner_id,
        solutions_engineer_id: deal.solutions_engineer_id ?? '',
        amount:                deal.amount != null ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(deal.amount)) : '',
        contract_term_months:  deal.contract_term_months != null ? String(deal.contract_term_months) : '',
        currency:              deal.currency,
        close_date:            deal.close_date ?? '',
      },
      editing: deal, formError: null, modal: 'edit',
    }))
    resetNotesForm()
    fetchDealNotes(deal.id)
  }

  async function openFeedback(deal: DealWithRelations) {
    setUIState(prev => ({ ...prev, feedbackDeal: deal, feedbackSummary: null, feedbackSummaryGeneratedAt: null }))
    setNotesUI('feedbackNotes', [])
    const [notesResult, summaryRes] = await Promise.all([
      supabase
        .from('notes')
        .select('*, author:profiles!created_by(full_name)')
        .eq('entity_type', 'deal')
        .eq('entity_id', deal.id)
        .order('created_at', { ascending: false })
        .limit(3),
      fetch(`/api/deals/${deal.id}/summarize`),
    ])
    setNotesUI('feedbackNotes', (notesResult.data ?? []) as NoteWithAuthor[])
    if (summaryRes.ok) {
      const body = await summaryRes.json()
      if (body.summary) {
        setUIState(prev => ({ ...prev, feedbackSummary: body.summary, feedbackSummaryGeneratedAt: body.generatedAt ?? null }))
      }
    }
  }

  // ── Note CRUD ────────────────────────────────────────────────────────────────
  async function addDealNote() {
    if (!noteText.trim() || !editing) return
    setNotesUI('loggingNote', true)
    const { error } = await supabase.from('notes').insert({
      entity_type: 'deal', entity_id: editing.id, note_text: noteText.trim(), created_by: userId,
    })
    if (!error) { setNotesUI('noteText', ''); fetchDealNotes(editing.id); fetchLastNoteDates(); fetchDeals() }
    setNotesUI('loggingNote', false)
  }

  async function deleteDealNote(noteId: string) {
    const { error } = await supabase.from('notes').delete().eq('id', noteId)
    if (!error) {
      setNotesState(prev => ({ ...prev, dealNotes: prev.dealNotes.filter(n => n.id !== noteId) }))
      fetchLastNoteDates()
    }
    setNotesUI('noteConfirmDelete', null)
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
      value_amount:          amountNum > 0 ? amountNum * 12 : null,
      total_contract_value:  amountNum > 0 && termNum > 0 ? amountNum * termNum : null,
      currency:              form.currency || 'USD',
      close_date:            form.close_date || null,
      solutions_engineer_id: form.solutions_engineer_id || null,
      ...(modal === 'edit' && form.deal_owner_id ? { deal_owner_id: form.deal_owner_id } : {}),
    }
    if (modal === 'add') {
      const { data: inserted, error } = await supabase.from('deals').insert({ ...payload, deal_owner_id: u!.id }).select('id').single()
      if (error) { setUI('formError', error.message) } else { closeModal(); fetchDeals() }
    } else if (modal === 'edit' && editing) {
      const stageChanged = form.stage_id !== editing.stage_id
      const { error } = await supabase.from('deals').update({ ...payload, last_activity_at: new Date().toISOString() }).eq('id', editing.id)
      if (error) {
        setUI('formError', error.message)
      } else {
        if (stageChanged) {
          await supabase.from('deal_stage_history').insert({
            deal_id: editing.id, from_stage_id: editing.stage_id, to_stage_id: form.stage_id, changed_by: u!.id,
          })
        }
        closeModal(); fetchDeals()
      }
    }
    setUI('saving', false)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('deals').delete().eq('id', id)
    if (error) console.error('delete deal:', error.message)
    else setDeals(prev => prev.filter(d => d.id !== id))
    setUI('confirmDelete', null)
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
      const q = search.toLowerCase()
      const matchSearch = !q || d.deal_name.toLowerCase().includes(q) || (d.accounts?.account_name ?? '').toLowerCase().includes(q)
      const matchStage  = !filterStage || d.stage_id === filterStage
      return matchSearch && matchStage
    }),
    [deals, search, filterStage]
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
    const nowMs    = Date.now()
    const ownerMap = new Map<string, OwnerSummary>()
    for (const d of filtered) {
      const oid = d.deal_owner_id
      const cur = ownerMap.get(oid) ?? { id: oid, name: d.deal_owner?.full_name ?? 'Unknown', count: 0, acv: 0, avgDays: null, overdue: 0 }
      cur.count++
      cur.acv += d.value_amount ?? 0
      if (d.close_date && d.close_date < todayStr && !d.deal_stages?.is_closed) cur.overdue++
      ownerMap.set(oid, cur)
    }
    for (const [oid, ownerSummary] of ownerMap) {
      const ownerDays = filtered
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
      <th onClick={() => toggleSort(col)} className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 text-left">
        {label}<span className={`ml-1 ${active ? 'text-gray-700' : 'text-gray-300'}`}>{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </th>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Deals</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setFilter('view', 'table')} className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Table</button>
            <button onClick={() => setFilter('view', 'kanban')} className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${view === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Kanban</button>
          </div>
          <Link href="/dashboard/deals/import" className="text-sm text-gray-500 hover:text-gray-700 font-medium border border-gray-300 px-3 py-2 rounded-lg transition-colors">Import CSV</Link>
          <button onClick={() => openAdd()} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ New deal</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <input type="text" placeholder="Search deals…" value={search} onChange={e => setFilter('search', e.target.value)} className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 w-64" />
        <select value={filterStage} onChange={e => setFilter('filterStage', e.target.value)} className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200">
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
                <button key={o.id} onClick={() => setFilter('filterOwner', filterOwner === o.id ? '' : o.id)} className={`text-left bg-white border rounded-xl p-4 shadow-sm transition-colors ${filterOwner === o.id ? 'border-l-4 border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
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
                <tr className="border-b border-gray-200 bg-gray-50">
                  <Th col="owner" label="Deal Owner" /><Th col="deal" label="Deal Name" /><Th col="stage" label="Stage" />
                  <Th col="acv" label="ACV (CAD)" /><Th col="close" label="Close Date" /><Th col="modified" label="Modified Date" />
                  <Th col="days" label="Days Since" /><Th col="health" label="Health" />
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(deal => (
                  <tr key={deal.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5 text-gray-500">{deal.deal_owner?.full_name ?? '—'}</td>
                    <td className="px-4 py-3.5 font-medium text-gray-900 max-w-[220px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button onClick={() => openEdit(deal)} className="truncate text-left hover:text-blue-600 transition-colors">{deal.deal_name}</button>
                        {(() => {
                          if (!deal.created_at) return false
                          const ms = new Date(deal.created_at).getTime()
                          if (!isFinite(ms)) return false
                          const daysAgo = (Date.now() - ms) / 86400000
                          return daysAgo >= 0 && daysAgo < newDealDaysThreshold
                        })() && (
                          <span className="shrink-0 inline-flex px-1.5 py-0 rounded text-xs font-medium bg-blue-50 text-blue-600 ring-1 ring-blue-200">New</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <select value={deal.stage_id} onChange={e => changeStage(deal, e.target.value)} className={`text-xs font-medium px-2 py-1 rounded-md border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer ${stageBadgeClass(deal.deal_stages)}`}>
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
<button onClick={() => openFeedback(deal)} title="Deal summary" className="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M15.988 3.012A2.25 2.25 0 0118 5.25v6.5A2.25 2.25 0 0115.75 14H13.5V7A2.5 2.5 0 0011 4.5H8.128a2.252 2.252 0 011.884-1.488A2.25 2.25 0 0112.25 2h1.5a2.25 2.25 0 012.238 1.012zM11.5 3.25a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v.25h-3v-.25z" clipRule="evenodd" /><path fillRule="evenodd" d="M2 7a1 1 0 011-1h8a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7zm2 3.25a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75zm0 3.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" clipRule="evenodd" /></svg></button>
                            {isAdmin && <button onClick={() => setUI('confirmDelete', deal.id)} title="Delete" className="text-gray-500 hover:text-red-600"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C9.327 4.025 9.66 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg></button>}
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
                        {deal.solutions_engineer?.full_name && <p className="text-xs text-blue-500 mt-0.5">SE: {deal.solutions_engineer.full_name}</p>}
                        {(deal.value_amount != null || deal.close_date) && (
                          <div className="flex items-center gap-3 mt-2">
                            {deal.value_amount != null && <span className="text-xs text-gray-700 font-medium">{formatCurrency(deal.value_amount)}</span>}
                            {deal.close_date && <span className="text-xs text-gray-400">{formatClose(deal.close_date)}</span>}
                          </div>
                        )}
                        <div className="mt-2">
                          <select value={deal.stage_id} onChange={e => changeStage(deal, e.target.value)} className="w-full text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300">
                            {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                          {isAdmin && confirmDelete === deal.id ? (
                            <><span className="text-xs text-gray-400">Delete?</span><button onClick={() => handleDelete(deal.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button><button onClick={() => setUI('confirmDelete', null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button></>
                          ) : (
                            <><button onClick={() => openEdit(deal)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>{isAdmin && <button onClick={() => setUI('confirmDelete', deal.id)} className="text-xs text-gray-500 hover:text-red-600">Delete</button>}</>
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

      {/* Feedback / Deal summary modal */}
      {feedbackDeal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Deal Summary</h3>
              <button onClick={closeFeedback} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Deal Name</p><p className="text-gray-900 font-medium">{feedbackDeal.deal_name}</p></div>
                <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Deal Owner</p><p className="text-gray-900">{feedbackDeal.deal_owner?.full_name ?? '—'}</p></div>
                <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Stage</p><p className="text-gray-900">{feedbackDeal.deal_stages?.stage_name ?? '—'}</p></div>
                <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Amount</p><p className="text-gray-900 font-medium">{feedbackDeal.amount != null ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(feedbackDeal.amount) : '—'}</p></div>
                <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Contract Term</p><p className="text-gray-900">{feedbackDeal.contract_term_months != null ? `${feedbackDeal.contract_term_months} months` : '—'}</p></div>
                <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Closing Date</p><p className="text-gray-900">{feedbackDeal.close_date ? new Date(feedbackDeal.close_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p></div>
                <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">ACV (CAD)</p><p className="text-gray-900 font-medium">{(() => { const acv = feedbackDeal.amount != null ? feedbackDeal.amount * 12 : feedbackDeal.value_amount; return acv != null ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(acv) : '—' })()}</p></div>
                <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">TCV (CAD)</p><p className="text-gray-900 font-medium">{(() => { const tcv = feedbackDeal.amount != null && feedbackDeal.contract_term_months != null ? feedbackDeal.amount * feedbackDeal.contract_term_months : feedbackDeal.total_contract_value; return tcv != null ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(tcv) : '—' })()}</p></div>
                <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Health Score</p><p>{feedbackDeal.health_score != null ? <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold ${healthBadgeClass(feedbackDeal.health_score)}`}>{feedbackDeal.health_score}</span> : <span className="text-gray-400">—</span>}</p></div>
                <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Modified Date</p><p className="text-gray-900">{(() => { const ts = lastNoteDates.get(feedbackDeal.id); return ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' })()}</p></div>
                <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Days Since Update</p><p className="text-gray-900">{(() => { const ts = lastNoteDates.get(feedbackDeal.id); return ts ? `${Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)} days` : '—' })()}</p></div>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Description</p>
                <p className="text-sm text-gray-700 leading-relaxed">{feedbackDeal.deal_description ?? <span className="text-gray-400 italic">No description</span>}</p>
              </div>
              {(isAdmin || isSalesManager) && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">AI Summary</p>
                      {feedbackSummaryGeneratedAt && (
                        <span className="text-xs text-gray-400">· Generated {relativeTime(feedbackSummaryGeneratedAt)}</span>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        setUI('loadingFeedbackSummary', true)
                        try {
                          const res = await fetch(`/api/deals/${feedbackDeal.id}/summarize`, { method: 'POST' })
                          const body = await res.json()
                          if (res.ok) {
                            setUIState(prev => ({ ...prev, feedbackSummary: body.summary, feedbackSummaryGeneratedAt: body.generatedAt ?? null }))
                          } else {
                            setUI('feedbackSummary', `Error: ${body.error}`)
                          }
                        } finally { setUI('loadingFeedbackSummary', false) }
                      }}
                      disabled={loadingFeedbackSummary}
                      className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 font-medium"
                    >
                      {loadingFeedbackSummary ? 'Summarizing…' : feedbackSummary ? 'Refresh' : 'Summarize'}
                    </button>
                  </div>
                  {feedbackSummary
                    ? (
                      <div className="bg-blue-50 rounded-lg p-4">
                        {feedbackSummary.split('\n\n').filter(Boolean).map((block, i) => {
                          if (block.startsWith('## ')) {
                            const nl = block.indexOf('\n')
                            const heading = nl === -1 ? block.slice(3) : block.slice(3, nl)
                            const body = nl === -1 ? '' : block.slice(nl + 1).trim()
                            return (
                              <div key={i} className={i > 0 ? 'mt-5' : ''}>
                                <p className="text-base font-semibold text-gray-900 mb-1.5 leading-snug">{heading}</p>
                                {body && <p className="text-sm text-gray-700 leading-relaxed">{body}</p>}
                              </div>
                            )
                          }
                          return <p key={i} className={`text-sm text-gray-700 leading-relaxed${i > 0 ? ' mt-3' : ''}`}>{block}</p>
                        })}
                      </div>
                    )
                    : <p className="text-xs text-gray-400">Click Summarize to generate an AI summary of this deal&apos;s notes.</p>}
                </div>
              )}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Recent Notes</p>
                {feedbackNotes.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No notes yet</p>
                ) : (
                  <div className="space-y-3">
                    {feedbackNotes.map(note => (
                      <div key={note.id} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-500">{note.author?.full_name ?? 'Unknown'}</span>
                          <span className="text-xs text-gray-400">{new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{note.note_text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {(() => {
              const ts = lastNoteDates.get(feedbackDeal.id)
              const modifiedDate = ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'
              const daysSince    = ts ? `${Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)} days` : 'N/A'
              const closeDate    = feedbackDeal.close_date ? new Date(feedbackDeal.close_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'
              const acvVal       = feedbackDeal.amount != null ? feedbackDeal.amount * 12 : feedbackDeal.value_amount
              const tcvVal       = feedbackDeal.amount != null && feedbackDeal.contract_term_months != null ? feedbackDeal.amount * feedbackDeal.contract_term_months : feedbackDeal.total_contract_value
              const fmt          = (v: number | null) => v != null ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v) : 'N/A'
              const acv          = fmt(acvVal)
              const notesBlock   = feedbackNotes.length > 0 ? feedbackNotes.map(n => `• ${new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — ${n.note_text}`).join('\n') : 'No notes recorded.'
              const bodyText =
`Hi ${feedbackDeal.deal_owner?.full_name ?? 'there'},

Here is a summary for deal "${feedbackDeal.deal_name}":

  Stage:             ${feedbackDeal.deal_stages?.stage_name ?? 'N/A'}
  Amount (CAD):      ${feedbackDeal.amount != null ? fmt(feedbackDeal.amount) : 'N/A'}
  Contract Term:     ${feedbackDeal.contract_term_months != null ? `${feedbackDeal.contract_term_months} months` : 'N/A'}
  ACV (CAD):         ${acv}
  TCV (CAD):         ${fmt(tcvVal)}
  Closing Date:      ${closeDate}
  Health Score:      ${feedbackDeal.health_score ?? 'N/A'}
  Modified Date:     ${modifiedDate}
  Days Since Update: ${daysSince}

Description:
${feedbackDeal.deal_description ?? 'No description provided.'}

Recent Notes:
${notesBlock}

Please review and let me know if any updates are needed.`
              const ownerProfile = profiles.find(p => p.id === feedbackDeal.deal_owner_id)
              return (
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { const ownerEmail = emailMap.get(feedbackDeal.deal_owner_id) ?? ''; window.location.href = `mailto:${ownerEmail}?subject=${encodeURIComponent(`Deal Update: ${feedbackDeal.deal_name}`)}&body=${encodeURIComponent(bodyText)}` }}
                      className="inline-flex items-center gap-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" /><path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" /></svg>
                      Email Owner
                    </button>
                    {ownerProfile?.slack_member_id && (
                      <a href={`slack://user?team=T02FCU97B&id=${ownerProfile.slack_member_id}`} className="inline-flex items-center gap-2 text-sm font-medium text-white bg-[#4A154B] hover:bg-[#3a1039] px-4 py-2 rounded-lg transition-colors">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
                        Slack Owner
                      </a>
                    )}
                    <button
                      onClick={() => { navigator.clipboard.writeText(bodyText).then(() => { setUI('copied', true); setTimeout(() => setUI('copied', false), 2000) }) }}
                      className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" /><path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" /></svg>
                      {copied ? 'Copied!' : 'Copy Info'}
                    </button>
                  </div>
                  <button onClick={closeFeedback} className="text-sm font-medium text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">Close</button>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">{modal === 'add' ? 'New deal' : 'Edit Deal'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
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
                        className="shrink-0 text-gray-400 hover:text-blue-600 transition-colors"
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
              {modal === 'edit' && (
                <Field label="Deal owner">
                  {(isAdmin || isSalesManager) ? (
                    <select value={form.deal_owner_id} onChange={set('deal_owner_id')} className={INPUT}>
                      {profiles.filter(p => p.role === 'sales').map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>)}
                    </select>
                  ) : (
                    <p className={`${INPUT} bg-gray-50 text-gray-600 cursor-default`}>{profiles.find(p => p.id === form.deal_owner_id)?.full_name ?? '—'}</p>
                  )}
                </Field>
              )}
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
                    <option value="USD">USD</option><option value="CAD">CAD</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Contract Term (months)"><input type="number" min="1" step="1" value={form.contract_term_months} onChange={set('contract_term_months')} placeholder="" className={INPUT} /></Field>
                <Field label="Close date"><input type="date" value={form.close_date} onChange={set('close_date')} className={INPUT} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="ACV (auto)">
                  <p className={`${INPUT} bg-gray-50 text-gray-600 cursor-default`}>{form.amount ? (formatCurrency(calcACV(form.amount)) ?? '—') : '—'}</p>
                </Field>
                <Field label="Total Contract Value (auto)">
                  <p className={`${INPUT} bg-gray-50 text-gray-600 cursor-default`}>{form.amount && form.contract_term_months ? (formatCurrency(calcTCV(form.amount, form.contract_term_months)) ?? '—') : '—'}</p>
                </Field>
              </div>

              {modal === 'edit' && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Notes</p>
                  <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
                    <textarea value={noteText} onChange={e => setNotesUI('noteText', e.target.value)} rows={3} placeholder="Add a note…" className={`${INPUT} resize-none mb-3`} />
                    <div className="flex justify-end">
                      <button onClick={addDealNote} disabled={loggingNote || !noteText.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                        {loggingNote ? 'Saving…' : 'Add note'}
                      </button>
                    </div>
                  </div>
                  {dealNotes.length === 0 ? (
                    <p className="text-sm text-gray-400">No notes yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {dealNotes.map(n => (
                        <li key={n.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{n.note_text}</p>
                          <div className="flex items-center justify-between mt-3">
                            <p className="text-xs text-gray-400">{n.author?.full_name ?? 'Unknown'} · {fmtTs(n.created_at)}</p>
                            {noteConfirmDelete === n.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">Delete?</span>
                                <button onClick={() => deleteDealNote(n.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                                <button onClick={() => setNotesUI('noteConfirmDelete', null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => setNotesUI('noteConfirmDelete', n.id)} title="Delete" className="text-gray-400 hover:text-red-600"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C9.327 4.025 9.66 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg></button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {formError && <p className="text-red-600 text-sm font-medium">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={closeModal} className="text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.deal_name.trim() || !form.stage_id} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
