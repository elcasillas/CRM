'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Contact, DealStage, DealWithContact } from '@/lib/types'

const supabase = createClient()

const STAGES: DealStage[] = ['qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost']

const STAGE_LABELS: Record<DealStage, string> = {
  qualified:   'Qualified',
  proposal:    'Proposal',
  negotiation: 'Negotiation',
  closed_won:  'Closed Won',
  closed_lost: 'Closed Lost',
}

const STAGE_HEADER_CLASSES: Record<DealStage, string> = {
  qualified:   'text-slate-300',
  proposal:    'text-yellow-300',
  negotiation: 'text-orange-300',
  closed_won:  'text-green-300',
  closed_lost: 'text-slate-400',
}

type FormData = {
  title:          string
  stage:          DealStage
  contact_id:     string
  value:          string
  expected_close: string
  notes:          string
}

const EMPTY_FORM: FormData = {
  title: '', stage: 'qualified', contact_id: '', value: '', expected_close: '', notes: '',
}

const INPUT = 'w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-slate-500 text-sm'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

function formatCurrency(value: number | null): string | null {
  if (value == null) return null
  const n = Number(value)
  if (isNaN(n)) return null
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${n.toFixed(0)}`
}

function formatClose(dateStr: string | null): string | null {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function PipelinePage() {
  const [deals,    setDeals]    = useState<DealWithContact[]>([])
  const [contacts, setContacts] = useState<Pick<Contact, 'id' | 'name'>[]>([])
  const [loading,  setLoading]  = useState(true)

  const [modal,     setModal]    = useState<'add' | 'edit' | null>(null)
  const [editing,   setEditing]  = useState<DealWithContact | null>(null)
  const [form,      setForm]     = useState<FormData>(EMPTY_FORM)
  const [saving,    setSaving]   = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const fetchDeals = useCallback(async () => {
    const { data, error } = await supabase
      .from('deals')
      .select('*, contacts(name)')
      .order('created_at', { ascending: false })
    if (error) console.error('deals fetch:', error.message)
    else setDeals((data ?? []) as DealWithContact[])
  }, [])

  const fetchContacts = useCallback(async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, name')
      .order('name')
    if (error) console.error('contacts fetch:', error.message)
    else setContacts(data ?? [])
  }, [])

  useEffect(() => {
    Promise.all([fetchDeals(), fetchContacts()]).then(() => setLoading(false))
  }, [fetchDeals, fetchContacts])

  function openAdd(stage: DealStage = 'qualified') {
    setForm({ ...EMPTY_FORM, stage })
    setEditing(null)
    setFormError(null)
    setModal('add')
  }

  function openEdit(deal: DealWithContact) {
    setForm({
      title:          deal.title,
      stage:          deal.stage,
      contact_id:     deal.contact_id  ?? '',
      value:          deal.value != null ? String(deal.value) : '',
      expected_close: deal.expected_close ?? '',
      notes:          deal.notes ?? '',
    })
    setEditing(deal)
    setFormError(null)
    setModal('edit')
  }

  function closeModal() {
    setModal(null)
    setEditing(null)
    setFormError(null)
  }

  function set(field: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSave() {
    setSaving(true)
    setFormError(null)

    const payload = {
      title:          form.title.trim(),
      stage:          form.stage,
      contact_id:     form.contact_id     || null,
      value:          form.value          ? parseFloat(form.value) : null,
      expected_close: form.expected_close || null,
      notes:          form.notes.trim()   || null,
    }

    if (modal === 'add') {
      const { error } = await supabase.from('deals').insert(payload)
      if (error) { setFormError(error.message) }
      else { closeModal(); fetchDeals() }
    } else if (modal === 'edit' && editing) {
      const { error } = await supabase.from('deals').update(payload).eq('id', editing.id)
      if (error) { setFormError(error.message) }
      else { closeModal(); fetchDeals() }
    }

    setSaving(false)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('deals').delete().eq('id', id)
    if (error) console.error('delete deal:', error.message)
    else setDeals(prev => prev.filter(d => d.id !== id))
    setConfirmDelete(null)
  }

  const byStage = (stage: DealStage) => deals.filter(d => d.stage === stage)

  const stageValue = (stage: DealStage) => {
    const total = byStage(stage).reduce((sum, d) => sum + (d.value != null ? Number(d.value) : 0), 0)
    return total > 0 ? formatCurrency(total) : null
  }

  return (
    <div className="px-6 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 max-w-full">
        <h2 className="text-xl font-semibold text-slate-100">Pipeline</h2>
        <button
          onClick={() => openAdd()}
          className="bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium px-4 py-2 rounded transition-colors"
        >
          + New deal
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : (
        /* Stage columns */
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3" style={{ minWidth: `${STAGES.length * 220 + (STAGES.length - 1) * 12}px` }}>
            {STAGES.map(stage => {
              const stageDeals = byStage(stage)
              const total = stageValue(stage)
              return (
                <div key={stage} className="flex flex-col w-52 flex-shrink-0">
                  {/* Column header */}
                  <div className="mb-3">
                    <div className="flex items-baseline justify-between">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${STAGE_HEADER_CLASSES[stage]}`}>
                        {STAGE_LABELS[stage]}
                      </span>
                      <span className="text-xs text-slate-500">{stageDeals.length}</span>
                    </div>
                    {total && (
                      <p className="text-xs text-slate-500 mt-0.5">{total}</p>
                    )}
                  </div>

                  {/* Deal cards */}
                  <div className="flex-1 space-y-2">
                    {stageDeals.map(deal => (
                      <div
                        key={deal.id}
                        className="bg-slate-800 border border-slate-700 rounded-lg p-3"
                      >
                        <p className="text-sm font-medium text-slate-100 leading-snug">{deal.title}</p>

                        {deal.contacts && (
                          <p className="text-xs text-slate-400 mt-1">{deal.contacts.name}</p>
                        )}

                        {(deal.value != null || deal.expected_close) && (
                          <div className="flex items-center gap-3 mt-2">
                            {deal.value != null && (
                              <span className="text-xs text-slate-300 font-medium">
                                {formatCurrency(deal.value)}
                              </span>
                            )}
                            {deal.expected_close && (
                              <span className="text-xs text-slate-500">
                                {formatClose(deal.expected_close)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Card actions */}
                        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-700">
                          {confirmDelete === deal.id ? (
                            <>
                              <span className="text-xs text-slate-400">Delete?</span>
                              <button onClick={() => handleDelete(deal.id)} className="text-xs text-red-400 hover:text-red-300">Confirm</button>
                              <button onClick={() => setConfirmDelete(null)} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => openEdit(deal)} className="text-xs text-slate-400 hover:text-slate-200">Edit</button>
                              <button onClick={() => setConfirmDelete(deal.id)} className="text-xs text-slate-400 hover:text-red-400">Delete</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Per-column add button */}
                    <button
                      onClick={() => openAdd(stage)}
                      className="w-full text-xs text-slate-500 hover:text-slate-300 border border-dashed border-slate-700 hover:border-slate-500 rounded-lg py-2 transition-colors"
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="font-medium text-slate-100">
                {modal === 'add' ? 'New deal' : 'Edit deal'}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-200 text-lg leading-none">✕</button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-4 space-y-4">
              <Field label="Title *">
                <input type="text" value={form.title} onChange={set('title')} required className={INPUT} />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Stage">
                  <select value={form.stage} onChange={set('stage')} className={INPUT}>
                    {STAGES.map(s => (
                      <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Contact">
                  <select value={form.contact_id} onChange={set('contact_id')} className={INPUT}>
                    <option value="">— none —</option>
                    {contacts.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Value ($)">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={form.value}
                    onChange={set('value')}
                    placeholder="0"
                    className={INPUT}
                  />
                </Field>
                <Field label="Expected close">
                  <input type="date" value={form.expected_close} onChange={set('expected_close')} className={INPUT} />
                </Field>
              </div>

              <Field label="Notes">
                <textarea value={form.notes} onChange={set('notes')} rows={3} className={`${INPUT} resize-none`} />
              </Field>

              {formError && <p className="text-red-400 text-sm">{formError}</p>}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button onClick={closeModal} className="text-sm text-slate-400 hover:text-slate-200">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-100 text-sm font-medium px-4 py-2 rounded transition-colors"
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
