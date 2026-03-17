'use client'

import { useEffect, useRef, useState } from 'react'
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog'
import { formIsDirty } from '@/hooks/useUnsavedChanges'

type Mapping = {
  id:          string
  dc_location: string
  cluster_id:  string
  is_active:   boolean
  updated_at:  string
}

type FormData = { dc_location: string; cluster_id: string }
const EMPTY_FORM: FormData = { dc_location: '', cluster_id: '' }

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100 text-sm'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DcClusterClient() {
  const [mappings, setMappings]     = useState<Mapping[]>([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState<'add' | 'edit' | null>(null)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [form, setForm]             = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [toggling, setToggling]     = useState<string | null>(null)
  const [formError, setFormError]   = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Unsaved changes tracking
  const initialRef = useRef<FormData | null>(null)
  const [showWarning, setShowWarning] = useState(false)
  const isFormDirty = modal !== null && formIsDirty(form, initialRef.current)

  useEffect(() => { fetchMappings() }, [])

  async function fetchMappings() {
    setLoading(true)
    const res = await fetch('/api/admin/dc-cluster-mappings')
    if (res.ok) setMappings(await res.json())
    setLoading(false)
  }

  // ── Modal helpers ────────────────────────────────────────────────────────────

  function openAdd() {
    setForm(EMPTY_FORM); setEditingId(null); setFormError(null); setSuccessMsg(null)
    initialRef.current = EMPTY_FORM
    setModal('add')
  }

  function openEdit(m: Mapping) {
    const f: FormData = { dc_location: m.dc_location, cluster_id: m.cluster_id }
    setForm(f); setEditingId(m.id); setFormError(null); setSuccessMsg(null)
    initialRef.current = f
    setModal('edit')
  }

  function guardedClose() {
    if (isFormDirty) { setShowWarning(true); return }
    forceClose()
  }

  function forceClose() {
    setModal(null); setEditingId(null); setFormError(null); initialRef.current = null; setShowWarning(false)
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.dc_location.trim() || !form.cluster_id.trim()) {
      setFormError('Both DC Location and Cluster ID are required.')
      return
    }
    setSaving(true); setFormError(null)

    const res = modal === 'add'
      ? await fetch('/api/admin/dc-cluster-mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      : await fetch('/api/admin/dc-cluster-mappings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...form }),
        })

    const body = await res.json()
    if (!res.ok) {
      setFormError(body.error ?? 'Save failed.')
    } else {
      setMappings(prev =>
        modal === 'add'
          ? [...prev, body].sort((a, b) => a.dc_location.localeCompare(b.dc_location) || a.cluster_id.localeCompare(b.cluster_id))
          : prev.map(m => m.id === body.id ? body : m)
      )
      setSuccessMsg(modal === 'add' ? 'Mapping added.' : 'Mapping updated.')
      forceClose()
    }
    setSaving(false)
  }

  // ── Toggle active ────────────────────────────────────────────────────────────

  async function toggleActive(m: Mapping) {
    setToggling(m.id); setSuccessMsg(null)
    const res = await fetch('/api/admin/dc-cluster-mappings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, is_active: !m.is_active }),
    })
    if (res.ok) {
      const updated = await res.json()
      setMappings(prev => prev.map(x => x.id === updated.id ? updated : x))
      setSuccessMsg(`Mapping ${updated.is_active ? 'enabled' : 'disabled'}.`)
      setTimeout(() => setSuccessMsg(null), 3000)
    }
    setToggling(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const activeCount   = mappings.filter(m => m.is_active).length
  const inactiveCount = mappings.length - activeCount

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">DC Location &amp; Cluster ID Mappings</h2>
          <p className="text-sm text-gray-500 mt-1">
            Controls the dropdown options on the Accounts page HID configuration. Only active mappings appear as selectable options.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          + Add Mapping
        </button>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-700 font-medium">
          {successMsg}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : mappings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm">No mappings yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mappings</span>
            <span className="text-xs text-gray-400">{activeCount} active{inactiveCount > 0 ? `, ${inactiveCount} disabled` : ''}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DC Location</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cluster ID</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mappings.map(m => (
                <tr key={m.id} className={`transition-colors ${m.is_active ? 'hover:bg-brand-50' : 'bg-gray-50/60 opacity-60 hover:opacity-80'}`}>
                  <td className="px-5 py-3 font-medium text-gray-900">{m.dc_location}</td>
                  <td className="px-5 py-3 text-gray-700">{m.cluster_id}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${m.is_active ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-gray-100 text-gray-500 ring-gray-200'}`}>
                      {m.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{fmtDate(m.updated_at)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => openEdit(m)}
                        className="text-xs text-gray-500 hover:text-brand-600 font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(m)}
                        disabled={toggling === m.id}
                        className={`text-xs font-medium transition-colors disabled:opacity-50 ${m.is_active ? 'text-gray-500 hover:text-amber-600' : 'text-gray-500 hover:text-green-600'}`}
                      >
                        {toggling === m.id ? '…' : m.is_active ? 'Disable' : 'Enable'}
                      </button>
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
            <div className="flex items-center justify-between px-6 py-4 bg-brand-700 rounded-t-xl">
              <h3 className="font-semibold text-white">{modal === 'add' ? 'New Mapping' : 'Edit Mapping'}</h3>
              <button onClick={guardedClose} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">DC Location *</label>
                <input
                  type="text"
                  value={form.dc_location}
                  onChange={e => setForm(f => ({ ...f, dc_location: e.target.value.toUpperCase() }))}
                  placeholder="e.g. CA"
                  className={INPUT}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Cluster ID *</label>
                <input
                  type="text"
                  value={form.cluster_id}
                  onChange={e => setForm(f => ({ ...f, cluster_id: e.target.value.toLowerCase() }))}
                  placeholder="e.g. c10"
                  className={INPUT}
                />
              </div>
              {modal === 'edit' && (
                <p className="text-xs text-gray-400">
                  Editing a mapping updates future HID dropdown options. Existing HID records referencing these values are not affected.
                </p>
              )}
              {formError && <p className="text-red-600 text-sm font-medium">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={guardedClose} className="text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.dc_location.trim() || !form.cluster_id.trim()}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : modal === 'add' ? 'Add Mapping' : 'Save Changes'}
              </button>
            </div>
            {showWarning && (
              <UnsavedChangesDialog
                onCancel={() => setShowWarning(false)}
                onDiscard={forceClose}
                onSave={async () => { await handleSave(); setShowWarning(false) }}
                saving={saving}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
