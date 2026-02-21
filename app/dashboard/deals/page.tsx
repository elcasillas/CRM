'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Account, DealStage, DealWithRelations } from '@/lib/types'

const supabase = createClient()

type FormData = {
  deal_name:    string
  account_id:   string
  stage_id:     string
  value_amount: string
  currency:     string
  close_date:   string
  deal_notes:   string
}

const EMPTY_FORM: FormData = {
  deal_name: '', account_id: '', stage_id: '', value_amount: '', currency: 'USD', close_date: '', deal_notes: '',
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
  const [stages, setStages]   = useState<DealStage[]>([])
  const [deals, setDeals]     = useState<DealWithRelations[]>([])
  const [accounts, setAccounts] = useState<Pick<Account, 'id' | 'account_name'>[]>([])
  const [loading, setLoading] = useState(true)

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

  const fetchStages = useCallback(async () => {
    const { data, error } = await supabase
      .from('deal_stages')
      .select('id, stage_name, sort_order, is_closed, is_won, is_lost')
      .order('sort_order')
    if (error) console.error('stages fetch:', error.message)
    else setStages(data ?? [])
  }, [])

  const fetchDeals = useCallback(async () => {
    const { data, error } = await supabase
      .from('deals')
      .select('*, accounts(account_name), deal_stages(stage_name, sort_order, is_closed, is_won, is_lost), deal_owner:profiles!deal_owner_id(full_name)')
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

  useEffect(() => {
    Promise.all([fetchStages(), fetchDeals(), fetchAccounts()]).then(() => setLoading(false))
  }, [fetchStages, fetchDeals, fetchAccounts])

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
      deal_name:    deal.deal_name,
      account_id:   deal.account_id ?? '',
      stage_id:     deal.stage_id,
      value_amount: deal.value_amount != null ? String(deal.value_amount) : '',
      currency:     deal.currency,
      close_date:   deal.close_date ?? '',
      deal_notes:   deal.deal_notes ?? '',
    })
    setEditing(deal); setFormError(null); setModal('edit')
  }

  function closeModal() { setModal(null); setEditing(null); setFormError(null) }

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
      deal_notes:   form.deal_notes.trim() || null,
    }
    if (modal === 'add') {
      const { error } = await supabase.from('deals').insert({ ...payload, deal_owner_id: user!.id })
      if (error) { setFormError(error.message) } else { closeModal(); fetchDeals() }
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
        closeModal(); fetchDeals()
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Close</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activity</th>
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
                    <td className="px-4 py-3.5 text-gray-400 text-xs">
                      {formatRelative(deal.last_activity_at)}
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
                            <button onClick={() => openEdit(deal)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>
                            <button onClick={() => setConfirmDelete(deal.id)} className="text-xs text-gray-500 hover:text-red-600">Delete</button>
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
                        <p className="text-sm font-medium text-gray-900 leading-snug">{deal.deal_name}</p>

                        {deal.accounts && (
                          <p className="text-xs text-gray-500 mt-1">{deal.accounts.account_name}</p>
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
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-md">
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
              <div className="grid grid-cols-2 gap-4">
                <Field label="Value">
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
