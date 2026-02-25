'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Account, DealStage, DealWithRelations, NoteWithAuthor } from '@/lib/types'

const supabase = createClient()

type FormData = {
  deal_name:             string
  account_id:            string
  stage_id:              string
  deal_owner_id:         string
  solutions_engineer_id: string
  value_amount:          string
  currency:              string
  close_date:            string
  deal_notes:            string
}

const EMPTY_FORM: FormData = {
  deal_name: '', account_id: '', stage_id: '', deal_owner_id: '', solutions_engineer_id: '', value_amount: '', currency: 'USD', close_date: '', deal_notes: '',
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
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([])
  const [isAdmin, setIsAdmin]   = useState(false)
  const [loading, setLoading]   = useState(true)

  // Filters
  const [search, setSearch]         = useState('')
  const [filterStage, setFilterStage] = useState('')

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

  // AI summary
  const [summary, setSummary]               = useState<string | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)

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
      .select('id, full_name, role')
      .order('full_name')
    if (error) { console.error('profiles fetch:', error.message); return }
    setProfiles(data ?? [])
    const me = (data ?? []).find(p => p.id === user?.id)
    setIsAdmin(me?.role === 'admin')
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

  useEffect(() => {
    Promise.all([fetchStages(), fetchDeals(), fetchAccounts(), fetchProfiles()]).then(() => setLoading(false))
  }, [fetchStages, fetchDeals, fetchAccounts, fetchProfiles])

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
      account_id:            deal.account_id ?? '',
      stage_id:              deal.stage_id,
      deal_owner_id:         deal.deal_owner_id,
      solutions_engineer_id: deal.solutions_engineer_id ?? '',
      value_amount:          deal.value_amount != null ? String(deal.value_amount) : '',
      currency:              deal.currency,
      close_date:            deal.close_date ?? '',
      deal_notes:            deal.deal_notes ?? '',
    })
    setDealNotes([]); setNoteText(''); setNoteConfirmDelete(null); setSummary(null)
    fetchDealNotes(deal.id)
    setEditing(deal); setFormError(null); setModal('edit')
  }

  function closeModal() { setModal(null); setEditing(null); setFormError(null); setDealNotes([]); setNoteText(''); setSummary(null) }

  async function addDealNote() {
    if (!noteText.trim() || !editing) return
    setLoggingNote(true)
    const { error } = await supabase.from('notes').insert({
      entity_type: 'deal',
      entity_id:   editing.id,
      note_text:   noteText.trim(),
      created_by:  userId,
    })
    if (!error) { setNoteText(''); fetchDealNotes(editing.id); triggerHealthScore(editing.id) }
    setLoggingNote(false)
  }

  async function deleteDealNote(noteId: string) {
    const { error } = await supabase.from('notes').delete().eq('id', noteId)
    if (!error) setDealNotes(prev => prev.filter(n => n.id !== noteId))
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
      deal_name:    form.deal_name.trim(),
      account_id:   form.account_id   || null,
      stage_id:     form.stage_id,
      value_amount: form.value_amount ? parseFloat(form.value_amount) : null,
      currency:     form.currency     || 'USD',
      close_date:   form.close_date   || null,
      deal_notes:            form.deal_notes.trim() || null,
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

  const filtered = deals.filter(d => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || d.deal_name.toLowerCase().includes(q)
      || (d.accounts?.account_name ?? '').toLowerCase().includes(q)
    const matchStage = !filterStage || d.stage_id === filterStage
    return matchSearch && matchStage
  })

  const byStage = (stageId: string) => filtered.filter(d => d.stage_id === stageId)

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
        {!loading && (search || filterStage) && (
          <span className="text-sm text-gray-400">{filtered.length} of {deals.length}</span>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : view === 'table' ? (
        // ── Table view ──────────────────────────────────────────────────────
        filtered.length === 0 ? (
          <p className="text-gray-500 text-sm">No deals match your filters.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ACV</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Close</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deal Owner</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SE</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Health</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(deal => (
                  <tr key={deal.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-gray-900 max-w-[220px]">
                      <span className="truncate block">{deal.deal_name}</span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">
                      {deal.accounts?.account_name ?? '—'}
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
                    <td className="px-4 py-3.5 text-gray-500">
                      {formatClose(deal.close_date) ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">
                      {deal.deal_owner?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">
                      {deal.solutions_engineer?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-gray-400 text-xs">
                      {formatRelative(deal.last_activity_at)}
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
                        {confirmDelete === deal.id ? (
                          <>
                            <span className="text-xs text-gray-400">Delete?</span>
                            <button onClick={() => handleDelete(deal.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                            <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => openEdit(deal)} title="Edit" className="text-gray-500 hover:text-gray-700"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></svg></button>
                            <button onClick={() => setConfirmDelete(deal.id)} title="Delete" className="text-gray-500 hover:text-red-600"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C9.327 4.025 9.66 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg></button>
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
                          {confirmDelete === deal.id ? (
                            <>
                              <span className="text-xs text-gray-400">Delete?</span>
                              <button onClick={() => handleDelete(deal.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                              <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => openEdit(deal)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>
                              <button onClick={() => setConfirmDelete(deal.id)} className="text-xs text-gray-500 hover:text-red-600">Delete</button>
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

      {/* Add / Edit modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">{modal === 'add' ? 'New deal' : 'Edit deal'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <Field label="Deal name *">
                <input type="text" value={form.deal_name} onChange={set('deal_name')} className={INPUT} />
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
                  <select value={form.deal_owner_id} onChange={set('deal_owner_id')} className={INPUT}>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Solutions Engineer">
                <select value={form.solutions_engineer_id} onChange={set('solutions_engineer_id')} className={INPUT}>
                  <option value="">— none —</option>
                  {profiles.map(p => (
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
              <Field label="Notes">
                <textarea value={form.deal_notes} onChange={set('deal_notes')} rows={3} className={`${INPUT} resize-none`} />
              </Field>

              {/* Activity notes — only shown when editing an existing deal */}
              {modal === 'edit' && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Activity</p>
                  <div className="flex gap-2 mb-3">
                    <textarea
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      rows={2}
                      placeholder="Add a note…"
                      className={`${INPUT} resize-none flex-1`}
                    />
                    <button
                      onClick={addDealNote}
                      disabled={loggingNote || !noteText.trim()}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium px-3 rounded-lg transition-colors self-stretch"
                    >
                      {loggingNote ? '…' : 'Add'}
                    </button>
                  </div>
                  {dealNotes.length > 0 && (
                    <ul className="space-y-2 max-h-48 overflow-y-auto">
                      {dealNotes.map(n => (
                        <li key={n.id} className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{n.note_text}</p>
                          <div className="flex items-center justify-between mt-2">
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

              {/* AI summary — edit mode only */}
              {modal === 'edit' && editing && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700">AI summary</p>
                    <button
                      onClick={async () => {
                        setLoadingSummary(true)
                        try {
                          const res = await fetch(`/api/deals/${editing.id}/summarize`, { method: 'POST' })
                          const body = await res.json()
                          if (res.ok) setSummary(body.summary)
                          else setSummary(`Error: ${body.error}`)
                        } finally {
                          setLoadingSummary(false)
                        }
                      }}
                      disabled={loadingSummary}
                      className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 font-medium"
                    >
                      {loadingSummary ? 'Summarizing…' : summary ? 'Refresh' : 'Summarize'}
                    </button>
                  </div>
                  {summary ? (
                    <p className="text-sm text-gray-700 bg-blue-50 rounded-lg p-3 leading-relaxed">{summary}</p>
                  ) : (
                    <p className="text-xs text-gray-400">Click Summarize to generate an AI summary of this deal&apos;s notes using Claude.</p>
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
