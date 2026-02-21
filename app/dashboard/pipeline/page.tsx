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

function stageHeaderClass(s: DealStage): string {
  if (s.is_lost) return 'text-red-500'
  if (s.is_won)  return 'text-green-600'
  if (s.sort_order <= 3) return 'text-gray-600'
  if (s.sort_order <= 5) return 'text-amber-600'
  return 'text-orange-600'
}

export default function PipelinePage() {
  const [stages,  setStages]  = useState<DealStage[]>([])
  const [deals,   setDeals]   = useState<DealWithRelations[]>([])
  const [accounts, setAccounts] = useState<Pick<Account, 'id' | 'account_name'>[]>([])
  const [loading, setLoading] = useState(true)

  const [modal,     setModal]     = useState<'add' | 'edit' | null>(null)
  const [editing,   setEditing]   = useState<DealWithRelations | null>(null)
  const [form,      setForm]      = useState<FormData>(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
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
      .order('created_at', { ascending: false })
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

  function openAdd(stageId = '') {
    setForm({ ...EMPTY_FORM, stage_id: stageId || (stages[1]?.id ?? '') })
    setEditing(null); setFormError(null); setModal('add')
  }

  function openEdit(deal: DealWithRelations) {
    setForm({
      deal_name:    deal.deal_name,
      account_id:   deal.account_id,
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
      const { error } = await supabase.from('deals').update(payload).eq('id', editing.id)
      if (error) { setFormError(error.message) } else { closeModal(); fetchDeals() }
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('deals').delete().eq('id', id)
    if (error) console.error('delete deal:', error.message)
    else setDeals(prev => prev.filter(d => d.id !== id))
    setConfirmDelete(null)
  }

  const byStage = (stageId: string) => deals.filter(d => d.stage_id === stageId)

  const stageTotal = (stageId: string) => {
    const total = byStage(stageId).reduce((s, d) => s + (d.value_amount != null ? Number(d.value_amount) : 0), 0)
    return total > 0 ? formatCurrency(total) : null
  }

  return (
    <div className="px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Pipeline</h2>
        <button
          onClick={() => openAdd()}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New deal
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3" style={{ minWidth: `${stages.length * 220 + (stages.length - 1) * 12}px` }}>
            {stages.map(stage => {
              const stageDeals = byStage(stage.id)
              const total = stageTotal(stage.id)
              return (
                <div key={stage.id} className="flex flex-col w-52 flex-shrink-0">
                  {/* Column header */}
                  <div className="mb-3 px-1">
                    <div className="flex items-baseline justify-between">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${stageHeaderClass(stage)}`}>
                        {stage.stage_name}
                      </span>
                      <span className="text-xs text-gray-400">{stageDeals.length}</span>
                    </div>
                    {total && <p className="text-xs text-gray-400 mt-0.5">{total}</p>}
                  </div>

                  {/* Deal cards */}
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
            <div className="px-6 py-5 space-y-4">
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
