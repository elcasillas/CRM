'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DealStage } from '@/lib/types'

const supabase = createClient()

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm'

type FormData = {
  stage_name: string
  is_closed:  boolean
  is_won:     boolean
  is_lost:    boolean
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export default function AdminStagesPage() {
  const [stages, setStages]   = useState<DealStage[]>([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal]         = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing]     = useState<DealStage | null>(null)
  const [form, setForm]           = useState<FormData>({ stage_name: '', is_closed: false, is_won: false, is_lost: false })
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<Record<string, string>>({})

  const fetchStages = useCallback(async () => {
    const { data, error } = await supabase
      .from('deal_stages')
      .select('id, stage_name, sort_order, is_closed, is_won, is_lost')
      .order('sort_order')
    if (error) console.error('stages fetch:', error.message)
    else setStages(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchStages() }, [fetchStages])

  async function moveStage(index: number, direction: 'up' | 'down') {
    const other = direction === 'up' ? index - 1 : index + 1
    if (other < 0 || other >= stages.length) return

    const a = stages[index]
    const b = stages[other]
    const [r1, r2] = await Promise.all([
      supabase.from('deal_stages').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('deal_stages').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    if (r1.error) console.error(r1.error.message)
    if (r2.error) console.error(r2.error.message)
    fetchStages()
  }

  function openAdd() {
    setForm({ stage_name: '', is_closed: false, is_won: false, is_lost: false })
    setEditing(null); setFormError(null); setModal('add')
  }

  function openEdit(s: DealStage) {
    setForm({ stage_name: s.stage_name, is_closed: s.is_closed, is_won: s.is_won, is_lost: s.is_lost })
    setEditing(s); setFormError(null); setModal('edit')
  }

  function closeModal() { setModal(null); setEditing(null); setFormError(null) }

  function setFlag(field: 'is_closed' | 'is_won' | 'is_lost') {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const checked = e.target.checked
      setForm(f => {
        const next = { ...f, [field]: checked }
        // is_won and is_lost imply is_closed
        if ((field === 'is_won' || field === 'is_lost') && checked) next.is_closed = true
        return next
      })
    }
  }

  async function handleSave() {
    if (!form.stage_name.trim()) { setFormError('Stage name is required'); return }
    setSaving(true); setFormError(null)

    const payload = {
      stage_name: form.stage_name.trim(),
      is_closed:  form.is_closed,
      is_won:     form.is_won,
      is_lost:    form.is_lost,
    }

    if (modal === 'add') {
      const maxOrder = stages.length > 0 ? Math.max(...stages.map(s => s.sort_order)) : 0
      const { error } = await supabase.from('deal_stages').insert({ ...payload, sort_order: maxOrder + 1 })
      if (error) { setFormError(error.message) } else { closeModal(); fetchStages() }
    } else if (modal === 'edit' && editing) {
      const { error } = await supabase.from('deal_stages').update(payload).eq('id', editing.id)
      if (error) { setFormError(error.message) } else { closeModal(); fetchStages() }
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeleteError(prev => ({ ...prev, [id]: '' }))
    const { error } = await supabase.from('deal_stages').delete().eq('id', id)
    if (error) {
      const msg = error.message.includes('foreign key') || error.message.includes('violates')
        ? 'Stage is referenced by existing deals — remove those deals first.'
        : error.message
      setDeleteError(prev => ({ ...prev, [id]: msg }))
    } else {
      setStages(prev => prev.filter(s => s.id !== id))
    }
  }

  function flagBadge(label: string, active: boolean) {
    if (!active) return null
    return (
      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{label}</span>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Deal Stages</h2>
          <p className="text-sm text-gray-500 mt-0.5">Reorder or edit stages. Stages in use cannot be deleted.</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New stage
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">Order</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flags</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stages.map((stage, i) => (
                <tr key={stage.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveStage(i, 'up')}
                        disabled={i === 0}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <span className="text-xs text-gray-400 text-center">{stage.sort_order}</span>
                      <button
                        onClick={() => moveStage(i, 'down')}
                        disabled={i === stages.length - 1}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none"
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-medium text-gray-900">{stage.stage_name}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {flagBadge('Closed', stage.is_closed)}
                      {flagBadge('Won', stage.is_won)}
                      {flagBadge('Lost', stage.is_lost)}
                      {!stage.is_closed && !stage.is_won && !stage.is_lost && (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                    {deleteError[stage.id] && (
                      <p className="text-xs text-red-600 mt-1">{deleteError[stage.id]}</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3 justify-end">
                      <button onClick={() => openEdit(stage)} title="Edit" className="text-gray-500 hover:text-gray-700"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></svg></button>
                      <button onClick={() => handleDelete(stage.id)} title="Delete" className="text-gray-500 hover:text-red-600"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C9.327 4.025 9.66 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">{modal === 'add' ? 'New stage' : 'Edit stage'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="Stage name *">
                <input
                  type="text"
                  value={form.stage_name}
                  onChange={e => setForm(f => ({ ...f, stage_name: e.target.value }))}
                  className={INPUT}
                  autoFocus
                />
              </Field>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Flags</label>
                {(['is_closed', 'is_won', 'is_lost'] as const).map(flag => (
                  <label key={flag} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form[flag]}
                      onChange={setFlag(flag)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 capitalize">{flag.replace('is_', '')}</span>
                  </label>
                ))}
                <p className="text-xs text-gray-400">Won and Lost automatically set Closed.</p>
              </div>
              {formError && <p className="text-red-600 text-sm font-medium">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={closeModal} className="text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving}
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
