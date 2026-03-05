'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Account, DealStage, DealWithRelations, NoteWithAuthor } from '@/lib/types'

const supabase = createClient()

type FormData = {
  deal_name:             string
  deal_description:      string
  account_id:            string
  stage_id:              string
  deal_owner_id:         string
  solutions_engineer_id: string
  value_amount:          string
  currency:              string
  close_date:            string
}

const EMPTY_FORM: FormData = {
  deal_name: '', deal_description: '', account_id: '', stage_id: '', deal_owner_id: '', solutions_engineer_id: '', value_amount: '', currency: 'USD', close_date: '',
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

function formatRelative(ts: string | null): string {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30)  return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
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

export default function DealsPage() {
  const [view, setView]       = useState<'table' | 'kanban'>('table')
  const [stages, setStages]     = useState<DealStage[]>([])
  const [deals, setDeals]       = useState<DealWithRelations[]>([])
  const [accounts, setAccounts] = useState<Pick<Account, 'id' | 'account_name'>[]>([])
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null; role: string; slack_member_id: string | null }[]>([])
  const [isAdmin, setIsAdmin]           = useState(false)
  const [isSalesManager, setIsSalesManager] = useState(false)
  const [loading, setLoading]   = useState(true)

  // Filters
  const [search, setSearch]         = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [sortCol, setSortCol]       = useState('')
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('asc')
  const [filterOwner, setFilterOwner] = useState('')
  const [filterStale, setFilterStale]     = useState(false)
  const [filterOverdue, setFilterOverdue] = useState(false)

  // Modal
  const [modal, setModal]         = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing]     = useState<DealWithRelations | null>(null)
  const [form, setForm]           = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Deal notes (shown in edit modal)
  const [dealNotes, setDealNotes]     = useState<NoteWithAuthor[]>([])
  const [noteText, setNoteText]       = useState('')
  const [loggingNote, setLoggingNote] = useState(false)
  const [noteConfirmDelete, setNoteConfirmDelete] = useState<string | null>(null)
  const [userId, setUserId]           = useState('')

  // Last note date per deal (for Modified Date column)
  const [lastNoteDates, setLastNoteDates] = useState<Map<string, string>>(new Map())

  // AI summary
  const [summary, setSummary]               = useState<string | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)

  // User email map (id -> email), used for mailto links
  const [emailMap, setEmailMap] = useState<Map<string, string>>(new Map())

  // Feedback modal
  const [feedbackDeal, setFeedbackDeal]               = useState<DealWithRelations | null>(null)
  const [feedbackNotes, setFeedbackNotes]             = useState<NoteWithAuthor[]>([])
  const [feedbackSummary, setFeedbackSummary]         = useState<string | null>(null)
  const [loadingFeedbackSummary, setLoadingFeedbackSummary] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchStages = useCallback(async () => {
    const { data, error } = await supabase
      .from('deal_stages')
      .select('id, stage_name, sort_order, is_closed, is_won, is_lost, win_probability')
      .order('sort_order')
    if (error) console.error('stages fetch:', error.message)
    else setStages((data ?? []) as DealStage[])
  }, [])

  const fetchDeals = useCallback(async () => {
    const { data, error } = await supabase
      .from('deals')
      .select('*, accounts(account_name), deal_stages(stage_name, sort_order, is_closed, is_won, is_lost), deal_owner:profiles!deal_owner_id(full_name), solutions_engineer:profiles!solutions_engineer_id(full_name)')
      .order('last_activity_at', { ascending: false, nullsFirst: false })
    if (error) console.error('deals fetch:', error.message)
    else setDeals((data ?? []) as DealWithRelations[])
  }, [])

  const fetchAccounts = useCallback(async () => {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, account_name')
      .order('account_name')
    if (error) console.error('accounts fetch:', error.message)
    else setAccounts(data ?? [])
  }, [])

  const fetchProfiles = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUserId(user.id)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, slack_member_id')
      .order('full_name')
    if (error) { console.error('profiles fetch:', error.message); return }
    setProfiles(data ?? [])
    const me = (data ?? []).find(p => p.id === user?.id)
    setIsAdmin(me?.role === 'admin')
    setIsSalesManager(me?.role === 'sales_manager')
  }, [])

  function triggerHealthScore(dealId: string) {
    fetch(`/api/deals/${dealId}/health-score`, { method: 'POST' })
      .then(() => fetchDeals())
      .catch(() => { /* silent */ })
  }

  const fetchDealNotes = useCallback(async (dealId: string) => {
    const { data } = await supabase
      .from('notes')
      .select('*, author:profiles!created_by(full_name)')
      .eq('entity_type', 'deal')
      .eq('entity_id', dealId)
      .order('created_at', { ascending: false })
    setDealNotes((data ?? []) as NoteWithAuthor[])
  }, [])

  const fetchLastNoteDates = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then((users: { id: string; email: string }[]) => {
      setEmailMap(new Map(users.map(u => [u.id, u.email])))
    }).catch(() => {})
    Promise.all([fetchStages(), fetchDeals(), fetchAccounts(), fetchProfiles(), fetchLastNoteDates()]).then(() => setLoading(false))
  }, [fetchStages, fetchDeals, fetchAccounts, fetchProfiles, fetchLastNoteDates])

  async function changeStage(deal: DealWithRelations, newStageId: string) {
    if (!newStageId || newStageId === deal.stage_id) return
    const { data: { user } } = await supabase.auth.getUser()
    const now = new Date().toISOString()

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('deals').update({ stage_id: newStageId, last_activity_at: now }).eq('id', deal.id),
      supabase.from('deal_stage_history').insert({
        deal_id:       deal.id,
        from_stage_id: deal.stage_id,
        to_stage_id:   newStageId,
        changed_by:    user!.id,
      }),
    ])
    if (e1) console.error('stage update:', e1.message)
    if (e2) console.error('history insert:', e2.message)
    fetchDeals()
  }

  function openAdd(stageId = '') {
    setForm({ ...EMPTY_FORM, stage_id: stageId || (stages[1]?.id ?? '') })
    setEditing(null); setFormError(null); setModal('add')
  }

  function openEdit(deal: DealWithRelations) {
    setForm({
      deal_name:             deal.deal_name,
      deal_description:      deal.deal_description ?? '',
      account_id:            deal.account_id ?? '',
      stage_id:              deal.stage_id,
      deal_owner_id:         deal.deal_owner_id,
      solutions_engineer_id: deal.solutions_engineer_id ?? '',
      value_amount:          deal.value_amount != null ? String(deal.value_amount) : '',
      currency:              deal.currency,
      close_date:            deal.close_date ?? '',
    })
    setDealNotes([]); setNoteText(''); setNoteConfirmDelete(null); setSummary(null)
    fetchDealNotes(deal.id)
    setEditing(deal); setFormError(null); setModal('edit')
  }

  function closeModal() { setModal(null); setEditing(null); setFormError(null); setDealNotes([]); setNoteText(''); setSummary(null) }

  async function openFeedback(deal: DealWithRelations) {
    setFeedbackDeal(deal)
    setFeedbackNotes([])
    setFeedbackSummary(null)
    const { data } = await supabase
      .from('notes')
      .select('*, author:profiles!created_by(full_name)')
      .eq('entity_type', 'deal')
      .eq('entity_id', deal.id)
      .order('created_at', { ascending: false })
      .limit(3)
    setFeedbackNotes((data ?? []) as NoteWithAuthor[])
  }

  function closeFeedback() { setFeedbackDeal(null); setFeedbackNotes([]); setFeedbackSummary(null) }

  async function addDealNote() {
    if (!noteText.trim() || !editing) return
    setLoggingNote(true)
    const { error } = await supabase.from('notes').insert({
      entity_type: 'deal',
      entity_id:   editing.id,
      note_text:   noteText.trim(),
      created_by:  userId,
    })
    if (!error) { setNoteText(''); fetchDealNotes(editing.id); fetchLastNoteDates(); triggerHealthScore(editing.id) }
    setLoggingNote(false)
  }

  async function deleteDealNote(noteId: string) {
    const { error } = await supabase.from('notes').delete().eq('id', noteId)
    if (!error) { setDealNotes(prev => prev.filter(n => n.id !== noteId)); fetchLastNoteDates() }
    setNoteConfirmDelete(null)
  }

  function set(field: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSave() {
    setSaving(true)
    setFormError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      deal_name:        form.deal_name.trim(),
      deal_description: form.deal_description.trim() || null,
      account_id:       form.account_id   || null,
      stage_id:         form.stage_id,
      value_amount:     form.value_amount ? parseFloat(form.value_amount) : null,
      currency:         form.currency     || 'USD',
      close_date:       form.close_date   || null,
      solutions_engineer_id: form.solutions_engineer_id || null,
      ...(modal === 'edit' && form.deal_owner_id ? { deal_owner_id: form.deal_owner_id } : {}),
    }
    if (modal === 'add') {
      const { data: inserted, error } = await supabase.from('deals').insert({ ...payload, deal_owner_id: user!.id }).select('id').single()
      if (error) { setFormError(error.message) } else { closeModal(); fetchDeals(); if (inserted) triggerHealthScore(inserted.id) }
    } else if (modal === 'edit' && editing) {
      const stageChanged = form.stage_id !== editing.stage_id
      const { error } = await supabase.from('deals')
        .update({ ...payload, last_activity_at: new Date().toISOString() })
        .eq('id', editing.id)
      if (error) {
        setFormError(error.message)
      } else {
        if (stageChanged) {
          await supabase.from('deal_stage_history').insert({
            deal_id:       editing.id,
            from_stage_id: editing.stage_id,
            to_stage_id:   form.stage_id,
            changed_by:    user!.id,
          })
        }
        closeModal(); fetchDeals(); triggerHealthScore(editing.id)
      }
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('deals').delete().eq('id', id)
    if (error) console.error('delete deal:', error.message)
    else setDeals(prev => prev.filter(d => d.id !== id))
    setConfirmDelete(null)
  }

  const todayStr = new Date().toISOString().split('T')[0]

  const filtered = deals.filter(d => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || d.deal_name.toLowerCase().includes(q)
      || (d.accounts?.account_name ?? '').toLowerCase().includes(q)
    const matchStage = !filterStage || d.stage_id === filterStage
    return matchSearch && matchStage
  })

  const displayDeals = filtered
    .filter(d => !filterOwner || d.deal_owner_id === filterOwner)
    .filter(d => !filterStale || (() => {
      const ts = lastNoteDates.get(d.id)
      return ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) >= 30 : false
    })())
    .filter(d => !filterOverdue || (!!d.close_date && d.close_date < todayStr && !d.deal_stages?.is_closed))

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  function sortValD(d: DealWithRelations): string | number | null {
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

  const sorted = sortCol
    ? [...displayDeals].sort((a, b) => {
        const va = sortValD(a), vb = sortValD(b)
        if (va == null && vb == null) return 0
        if (va == null) return 1
        if (vb == null) return -1
        const r = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
        return sortDir === 'asc' ? r : -r
      })
    : displayDeals

  function Th({ col, label, right }: { col: string; label: string; right?: boolean }) {
    const active = sortCol === col
    return (
      <th
        onClick={() => toggleSort(col)}
        className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 ${right ? 'text-right' : 'text-left'}`}
      >
        {label}
        <span className={`ml-1 ${active ? 'text-gray-700' : 'text-gray-300'}`}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </th>
    )
  }

  // ── Summary metrics (from displayDeals) ──────────────────────────────────
  const nowMs           = Date.now()
  const openDisplay     = displayDeals.filter(d => !d.deal_stages?.is_closed)
  const totalACV        = openDisplay.reduce((s, d) => s + (d.value_amount ?? 0), 0)
  const noteDays        = displayDeals.map(d => {
    const ts = lastNoteDates.get(d.id)
    return ts ? Math.floor((nowMs - new Date(ts).getTime()) / 86400000) : null
  }).filter((x): x is number => x !== null)
  const avgDays         = noteDays.length
    ? Math.round(noteDays.reduce((a, b) => a + b, 0) / noteDays.length)
    : null
  const staleCount      = noteDays.filter(d => d >= 30).length
  const overdueCount    = displayDeals.filter(d =>
    d.close_date && d.close_date < todayStr && !d.deal_stages?.is_closed).length
  const healthScores    = displayDeals.map(d => d.health_score).filter((x): x is number => x != null)
  const avgHealth       = healthScores.length
    ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length)
    : null

  // ── Owner summaries (from filtered, so all owners stay visible) ──────────
  type OwnerSummary = { id: string; name: string; count: number; acv: number; avgDays: number | null; overdue: number }
  const ownerMap = new Map<string, OwnerSummary>()
  for (const d of filtered) {
    const oid  = d.deal_owner_id
    const name = d.deal_owner?.full_name ?? 'Unknown'
    const cur  = ownerMap.get(oid) ?? { id: oid, name, count: 0, acv: 0, avgDays: null, overdue: 0 }
    cur.count++
    cur.acv += d.value_amount ?? 0
    if (d.close_date && d.close_date < todayStr && !d.deal_stages?.is_closed) cur.overdue++
    ownerMap.set(oid, cur)
  }
  for (const [oid, summary] of ownerMap) {
    const ownerDays = filtered
      .filter(d => d.deal_owner_id === oid)
      .map(d => d.last_activity_at
        ? Math.floor((nowMs - new Date(d.last_activity_at).getTime()) / 86400000)
        : null)
      .filter((x): x is number => x !== null)
    summary.avgDays = ownerDays.length
      ? Math.round(ownerDays.reduce((a, b) => a + b, 0) / ownerDays.length)
      : null
  }
  const ownerSummaries = [...ownerMap.values()].sort((a, b) => b.acv - a.acv)

  const byStage = (stageId: string) => displayDeals.filter(d => d.stage_id === stageId)

  const stageTotal = (stageId: string) => {
    const total = byStage(stageId).reduce((s, d) => s + (d.value_amount != null ? Number(d.value_amount) : 0), 0)
    return total > 0 ? formatCurrency(total) : null
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Deals</h2>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView('table')}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Table
            </button>
            <button
              onClick={() => setView('kanban')}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${view === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Kanban
            </button>
          </div>
          <Link
            href="/dashboard/deals/import"
            className="text-sm text-gray-500 hover:text-gray-700 font-medium border border-gray-300 px-3 py-2 rounded-lg transition-colors"
          >
            Import CSV
          </Link>
          <button
            onClick={() => openAdd()}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + New deal
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search deals…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 w-64"
        />
        <select
          value={filterStage}
          onChange={e => setFilterStage(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
        >
          <option value="">All stages</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
        </select>
        {(search || filterStage) && (
          <button onClick={() => { setSearch(''); setFilterStage('') }} className="text-sm text-gray-400 hover:text-gray-600">
            Clear
          </button>
        )}
        {!loading && (search || filterStage || filterOwner) && (
          <span className="text-sm text-gray-400">{displayDeals.length} of {deals.length}</span>
        )}
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      {!loading && deals.length > 0 && (
        <>
          {/* Overall Summary */}
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
            <button
              onClick={() => setFilterStale(f => !f)}
              className={`text-left border border-gray-200 border-l-4 border-l-amber-400 rounded-xl p-4 shadow-sm transition-colors ${filterStale ? 'bg-amber-50 ring-2 ring-amber-300' : 'bg-white hover:bg-amber-50'}`}
            >
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Stale (30+ days)</p>
              <p className="text-2xl font-bold text-gray-900">{staleCount}</p>
            </button>
            <button
              onClick={() => setFilterOverdue(f => !f)}
              className={`text-left border border-gray-200 border-l-4 border-l-red-400 rounded-xl p-4 shadow-sm transition-colors ${filterOverdue ? 'bg-red-50 ring-2 ring-red-300' : 'bg-white hover:bg-red-50'}`}
            >
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Overdue</p>
              <p className="text-2xl font-bold text-gray-900">{overdueCount}</p>
            </button>
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Avg Health Score</p>
              <p className="text-2xl font-bold text-gray-900">{avgHealth ?? '—'}</p>
            </div>
          </div>

          {/* By Deal Owner */}
          {ownerSummaries.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
              {ownerSummaries.map(o => (
                <button
                  key={o.id}
                  onClick={() => setFilterOwner(f => f === o.id ? '' : o.id)}
                  className={`text-left bg-white border rounded-xl p-4 shadow-sm transition-colors ${
                    filterOwner === o.id
                      ? 'border-l-4 border-blue-400 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-medium text-gray-900 text-sm mb-2 truncate">{o.name}</p>
                  <div className="grid grid-cols-4 gap-1 text-center">
                    <div>
                      <p className="text-base font-bold text-gray-900">{o.count}</p>
                      <p className="text-xs text-gray-400">Deals</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-gray-900">{formatCurrency(o.acv) ?? '—'}</p>
                      <p className="text-xs text-gray-400">ACV</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-gray-900">{o.avgDays ?? '—'}</p>
                      <p className="text-xs text-gray-400">Avg Days</p>
                    </div>
                    <div>
                      <p className={`text-base font-bold ${o.overdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>{o.overdue}</p>
                      <p className="text-xs text-gray-400">Overdue</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {(filterOwner || filterStale || filterOverdue) && (
            <div className="flex items-center gap-3 mb-3">
              {filterOwner && (
                <button onClick={() => setFilterOwner('')} className="text-xs text-gray-400 hover:text-gray-600">
                  ✕ Clear owner filter
                </button>
              )}
              {filterStale && (
                <button onClick={() => setFilterStale(false)} className="text-xs text-amber-600 hover:text-amber-800">
                  ✕ Clear stale filter
                </button>
              )}
              {filterOverdue && (
                <button onClick={() => setFilterOverdue(false)} className="text-xs text-red-600 hover:text-red-800">
                  ✕ Clear overdue filter
                </button>
              )}
            </div>
          )}
        </>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : view === 'table' ? (
        // ── Table view ──────────────────────────────────────────────────────
        displayDeals.length === 0 ? (
          <p className="text-gray-500 text-sm">No deals match your filters.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <Th col="owner"    label="Deal Owner" />
                  <Th col="deal"     label="Deal Name" />
                  <Th col="stage"    label="Stage" />
                  <Th col="acv"      label="ACV (CAD)" />
                  <Th col="close"    label="Close Date" />
                  <Th col="modified" label="Modified Date" />
                  <Th col="days"     label="Days Since" />
                  <Th col="health"   label="Health" />
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(deal => (
                  <tr key={deal.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5 text-gray-500">
                      {deal.deal_owner?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-gray-900 max-w-[220px]">
                      <span className="truncate block">{deal.deal_name}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <select
                        value={deal.stage_id}
                        onChange={e => changeStage(deal, e.target.value)}
                        className={`text-xs font-medium px-2 py-1 rounded-md border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer ${stageBadgeClass(deal.deal_stages)}`}
                      >
                        {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3.5 text-gray-700 font-medium">
                      {formatCurrency(deal.value_amount) ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      {(() => {
                        const isOverdue = deal.close_date && deal.close_date < todayStr && !deal.deal_stages?.is_closed
                        if (!deal.close_date) return <span className="text-gray-400">—</span>
                        if (isOverdue) return (
                          <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 font-semibold px-2 py-0.5 rounded-full ring-1 ring-red-300">
                            {formatClose(deal.close_date)} <span className="font-normal">Overdue</span>
                          </span>
                        )
                        return <span className="text-gray-500">{formatClose(deal.close_date)}</span>
                      })()}
                    </td>
                    <td className="px-4 py-3.5 text-gray-400 text-xs">
                      {(() => { const ts = lastNoteDates.get(deal.id); return ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—' })()}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      {(() => {
                        const ts = lastNoteDates.get(deal.id)
                        if (!ts) return <span className="text-gray-400">—</span>
                        const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
                        if (days >= 30) return (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded-full ring-1 ring-amber-300">
                            {days} <span className="font-normal">Stale</span>
                          </span>
                        )
                        return <span className="text-gray-400">{days}</span>
                      })()}
                    </td>
                    <td className="px-4 py-3.5">
                      {deal.health_score != null ? (
                        <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold ${healthBadgeClass(deal.health_score)}`}>
                          {deal.health_score}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3 justify-end">
                        {isAdmin && confirmDelete === deal.id ? (
                          <>
                            <span className="text-xs text-gray-400">Delete?</span>
                            <button onClick={() => handleDelete(deal.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                            <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => openEdit(deal)} title="Edit" className="text-gray-500 hover:text-gray-700"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></svg></button>
                            <button onClick={() => openFeedback(deal)} title="Deal summary" className="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M15.988 3.012A2.25 2.25 0 0118 5.25v6.5A2.25 2.25 0 0115.75 14H13.5V7A2.5 2.5 0 0011 4.5H8.128a2.252 2.252 0 011.884-1.488A2.25 2.25 0 0112.25 2h1.5a2.25 2.25 0 012.238 1.012zM11.5 3.25a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v.25h-3v-.25z" clipRule="evenodd" /><path fillRule="evenodd" d="M2 7a1 1 0 011-1h8a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7zm2 3.25a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75zm0 3.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" clipRule="evenodd" /></svg></button>
                            {isAdmin && <button onClick={() => setConfirmDelete(deal.id)} title="Delete" className="text-gray-500 hover:text-red-600"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C9.327 4.025 9.66 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg></button>}
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
        // ── Kanban view ─────────────────────────────────────────────────────
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3" style={{ minWidth: `${stages.length * 220 + (stages.length - 1) * 12}px` }}>
            {stages.map(stage => {
              const stageDeals = byStage(stage.id)
              const total = stageTotal(stage.id)
              return (
                <div key={stage.id} className="flex flex-col w-52 flex-shrink-0">
                  <div className="mb-3 px-1">
                    <div className="flex items-baseline justify-between">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${stageHeaderClass(stage)}`}>
                        {stage.stage_name}
                      </span>
                      <span className="text-xs text-gray-400">{stageDeals.length}</span>
                    </div>
                    {total && <p className="text-xs text-gray-400 mt-0.5">{total}</p>}
                  </div>

                  <div className="flex-1 space-y-2">
                    {stageDeals.map(deal => (
                      <div key={deal.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900 leading-snug">{deal.deal_name}</p>
                          {deal.health_score != null && (
                            <span className={`flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded ${healthBadgeClass(deal.health_score)}`}>
                              {deal.health_score}
                            </span>
                          )}
                        </div>

                        {deal.accounts && (
                          <p className="text-xs text-gray-500 mt-1">{deal.accounts.account_name}</p>
                        )}
                        {deal.solutions_engineer?.full_name && (
                          <p className="text-xs text-blue-500 mt-0.5">SE: {deal.solutions_engineer.full_name}</p>
                        )}

                        {(deal.value_amount != null || deal.close_date) && (
                          <div className="flex items-center gap-3 mt-2">
                            {deal.value_amount != null && (
                              <span className="text-xs text-gray-700 font-medium">{formatCurrency(deal.value_amount)}</span>
                            )}
                            {deal.close_date && (
                              <span className="text-xs text-gray-400">{formatClose(deal.close_date)}</span>
                            )}
                          </div>
                        )}

                        {/* Stage change select */}
                        <div className="mt-2">
                          <select
                            value={deal.stage_id}
                            onChange={e => changeStage(deal, e.target.value)}
                            className="w-full text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                          >
                            {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
                          </select>
                        </div>

                        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                          {isAdmin && confirmDelete === deal.id ? (
                            <>
                              <span className="text-xs text-gray-400">Delete?</span>
                              <button onClick={() => handleDelete(deal.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                              <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => openEdit(deal)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>
                              {isAdmin && <button onClick={() => setConfirmDelete(deal.id)} className="text-xs text-gray-500 hover:text-red-600">Delete</button>}
                            </>
                          )}
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={() => openAdd(stage.id)}
                      className="w-full text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 hover:border-gray-400 rounded-xl py-2 transition-colors bg-white/50"
                    >
                      + Add
                    </button>
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
              {/* Top info grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Deal Name</p>
                  <p className="text-gray-900 font-medium">{feedbackDeal.deal_name}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Deal Owner</p>
                  <p className="text-gray-900">{feedbackDeal.deal_owner?.full_name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Stage</p>
                  <p className="text-gray-900">{feedbackDeal.deal_stages?.stage_name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">ACV (CAD)</p>
                  <p className="text-gray-900 font-medium">{feedbackDeal.value_amount != null ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(feedbackDeal.value_amount) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Closing Date</p>
                  <p className="text-gray-900">{feedbackDeal.close_date ? new Date(feedbackDeal.close_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Health Score</p>
                  <p>{feedbackDeal.health_score != null ? (
                    <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold ${healthBadgeClass(feedbackDeal.health_score)}`}>{feedbackDeal.health_score}</span>
                  ) : <span className="text-gray-400">—</span>}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Modified Date</p>
                  <p className="text-gray-900">{(() => { const ts = lastNoteDates.get(feedbackDeal.id); return ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' })()}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Days Since Update</p>
                  <p className="text-gray-900">{(() => { const ts = lastNoteDates.get(feedbackDeal.id); return ts ? `${Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)} days` : '—' })()}</p>
                </div>
              </div>

              {/* Description */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Description</p>
                <p className="text-sm text-gray-700 leading-relaxed">{feedbackDeal.deal_description ?? <span className="text-gray-400 italic">No description</span>}</p>
              </div>

              {/* AI Summary — admin and sales manager only */}
              {(isAdmin || isSalesManager) && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">AI Summary</p>
                    <button
                      onClick={async () => {
                        setLoadingFeedbackSummary(true)
                        try {
                          const res = await fetch(`/api/deals/${feedbackDeal.id}/summarize`, { method: 'POST' })
                          const body = await res.json()
                          if (res.ok) setFeedbackSummary(body.summary)
                          else setFeedbackSummary(`Error: ${body.error}`)
                        } finally { setLoadingFeedbackSummary(false) }
                      }}
                      disabled={loadingFeedbackSummary}
                      className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 font-medium"
                    >
                      {loadingFeedbackSummary ? 'Summarizing…' : feedbackSummary ? 'Refresh' : 'Summarize'}
                    </button>
                  </div>
                  {feedbackSummary ? (
                    <p className="text-sm text-gray-700 bg-blue-50 rounded-lg p-3 leading-relaxed">{feedbackSummary}</p>
                  ) : (
                    <p className="text-xs text-gray-400">Click Summarize to generate an AI summary of this deal&apos;s notes.</p>
                  )}
                </div>
              )}

              {/* Notes */}
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
              const daysSince = ts ? `${Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)} days` : 'N/A'
              const closeDate = feedbackDeal.close_date ? new Date(feedbackDeal.close_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'
              const acv = feedbackDeal.value_amount != null ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(feedbackDeal.value_amount) : 'N/A'
              const notesBlock = feedbackNotes.length > 0
                ? feedbackNotes.map(n => `• ${new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — ${n.note_text}`).join('\n')
                : 'No notes recorded.'
              const bodyText =
`Hi ${feedbackDeal.deal_owner?.full_name ?? 'there'},

Here is a summary for deal "${feedbackDeal.deal_name}":

  Stage:             ${feedbackDeal.deal_stages?.stage_name ?? 'N/A'}
  ACV (CAD):         ${acv}
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
                    {/* Email */}
                    <button
                      onClick={() => {
                        const ownerEmail = emailMap.get(feedbackDeal.deal_owner_id) ?? ''
                        window.location.href = `mailto:${ownerEmail}?subject=${encodeURIComponent(`Deal Update: ${feedbackDeal.deal_name}`)}&body=${encodeURIComponent(bodyText)}`
                      }}
                      className="inline-flex items-center gap-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                        <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
                      </svg>
                      Email Owner
                    </button>
                    {/* Slack */}
                    {ownerProfile?.slack_member_id && (
                      <a
                        href={`slack://user?team=T02FCU97B&id=${ownerProfile.slack_member_id}`}
                        className="inline-flex items-center gap-2 text-sm font-medium text-white bg-[#4A154B] hover:bg-[#3a1039] px-4 py-2 rounded-lg transition-colors"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                        </svg>
                        Slack Owner
                      </a>
                    )}
                    {/* Copy Info */}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(bodyText).then(() => {
                          setCopied(true)
                          setTimeout(() => setCopied(false), 2000)
                        })
                      }}
                      className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                        <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                      </svg>
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
              <Field label="Deal name *">
                <input type="text" value={form.deal_name} onChange={set('deal_name')} className={INPUT} />
              </Field>
              <Field label="Description">
                <textarea value={form.deal_description} onChange={set('deal_description')} rows={2} placeholder="Optional description…" className={`${INPUT} resize-none`} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Account">
                  <select value={form.account_id} onChange={set('account_id')} className={INPUT}>
                    <option value="">— none —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                  </select>
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
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
                      ))}
                    </select>
                  ) : (
                    <p className={`${INPUT} bg-gray-50 text-gray-600 cursor-default`}>{profiles.find(p => p.id === form.deal_owner_id)?.full_name ?? '—'}</p>
                  )}
                </Field>
              )}
              <Field label="Solutions Engineer">
                <select value={form.solutions_engineer_id} onChange={set('solutions_engineer_id')} className={INPUT}>
                  <option value="">— none —</option>
                  {profiles.filter(p => p.role === 'solutions_engineer').map(p => (
                    <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="ACV">
                  <input type="number" min="0" step="100" value={form.value_amount} onChange={set('value_amount')} placeholder="0" className={INPUT} />
                </Field>
                <Field label="Currency">
                  <select value={form.currency} onChange={set('currency')} className={INPUT}>
                    <option value="USD">USD</option>
                    <option value="CAD">CAD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </Field>
              </div>
              <Field label="Close date">
                <input type="date" value={form.close_date} onChange={set('close_date')} className={INPUT} />
              </Field>
              {/* Notes — only shown when editing an existing deal */}
              {modal === 'edit' && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Notes</p>

                  {/* Add note input */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
                    <textarea
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      rows={3}
                      placeholder="Add a note…"
                      className={`${INPUT} resize-none mb-3`}
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={addDealNote}
                        disabled={loggingNote || !noteText.trim()}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                      >
                        {loggingNote ? 'Saving…' : 'Add note'}
                      </button>
                    </div>
                  </div>

                  {/* Unified note list: submitted notes (newest first) + deal_notes last */}
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
                                <button onClick={() => setNoteConfirmDelete(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => setNoteConfirmDelete(n.id)} title="Delete" className="text-gray-400 hover:text-red-600"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C9.327 4.025 9.66 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg></button>
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
              <button
                onClick={handleSave}
                disabled={saving || !form.deal_name.trim() || !form.stage_id}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
