'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Contact, ContactStatus } from '@/lib/types'

const supabase = createClient()

const STATUS_LABELS: Record<ContactStatus, string> = {
  lead:     'Lead',
  prospect: 'Prospect',
  customer: 'Customer',
  churned:  'Churned',
}

const STATUS_CLASSES: Record<ContactStatus, string> = {
  lead:     'bg-slate-700 text-slate-200',
  prospect: 'bg-yellow-900/50 text-yellow-300',
  customer: 'bg-green-900/50 text-green-300',
  churned:  'bg-red-900/50 text-red-300',
}

type FormData = {
  name: string
  email: string
  phone: string
  company: string
  status: ContactStatus
  notes: string
}

const EMPTY_FORM: FormData = {
  name: '', email: '', phone: '', company: '', status: 'lead', notes: '',
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

export default function ContactsPage() {
  const [contacts, setContacts]       = useState<Contact[]>([])
  const [loading, setLoading]         = useState(true)
  const [modal, setModal]             = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing]         = useState<Contact | null>(null)
  const [form, setForm]               = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving]           = useState(false)
  const [formError, setFormError]     = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('contacts fetch:', error.message)
    else setContacts(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditing(null)
    setFormError(null)
    setModal('add')
  }

  function openEdit(c: Contact) {
    setForm({
      name:    c.name,
      email:   c.email    ?? '',
      phone:   c.phone    ?? '',
      company: c.company  ?? '',
      status:  c.status,
      notes:   c.notes    ?? '',
    })
    setEditing(c)
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
      name:    form.name.trim(),
      email:   form.email.trim()   || null,
      phone:   form.phone.trim()   || null,
      company: form.company.trim() || null,
      status:  form.status,
      notes:   form.notes.trim()   || null,
    }

    if (modal === 'add') {
      const { error } = await supabase.from('contacts').insert(payload)
      if (error) { setFormError(error.message) }
      else { closeModal(); fetchContacts() }
    } else if (modal === 'edit' && editing) {
      const { error } = await supabase
        .from('contacts').update(payload).eq('id', editing.id)
      if (error) { setFormError(error.message) }
      else { closeModal(); fetchContacts() }
    }

    setSaving(false)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('contacts').delete().eq('id', id)
    if (error) console.error('delete:', error.message)
    else setContacts(prev => prev.filter(c => c.id !== id))
    setConfirmDelete(null)
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-100">Contacts</h2>
        <button
          onClick={openAdd}
          className="bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium px-4 py-2 rounded transition-colors"
        >
          + New contact
        </button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : contacts.length === 0 ? (
        <p className="text-slate-400 text-sm">No contacts yet. Add one to get started.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="pb-3 pr-6 text-slate-400 font-medium">Name</th>
                <th className="pb-3 pr-6 text-slate-400 font-medium">Email</th>
                <th className="pb-3 pr-6 text-slate-400 font-medium">Company</th>
                <th className="pb-3 pr-6 text-slate-400 font-medium">Status</th>
                <th className="pb-3 text-slate-400 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-3 pr-6">
                    <Link href={`/dashboard/contacts/${c.id}`} className="text-slate-200 hover:text-white transition-colors">
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-6 text-slate-400">{c.email ?? '—'}</td>
                  <td className="py-3 pr-6 text-slate-400">{c.company ?? '—'}</td>
                  <td className="py-3 pr-6">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASSES[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-3 justify-end">
                      {confirmDelete === c.id ? (
                        <>
                          <span className="text-slate-400 text-xs">Delete?</span>
                          <button onClick={() => handleDelete(c.id)} className="text-xs text-red-400 hover:text-red-300">Confirm</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => openEdit(c)} className="text-xs text-slate-400 hover:text-slate-200">Edit</button>
                          <button onClick={() => setConfirmDelete(c.id)} className="text-xs text-slate-400 hover:text-red-400">Delete</button>
                        </>
                      )}
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="font-medium text-slate-100">
                {modal === 'add' ? 'New contact' : 'Edit contact'}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-200 text-lg leading-none">✕</button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-4 space-y-4">
              <Field label="Name *">
                <input type="text" value={form.name} onChange={set('name')} required className={INPUT} />
              </Field>
              <Field label="Email">
                <input type="email" value={form.email} onChange={set('email')} className={INPUT} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone">
                  <input type="text" value={form.phone} onChange={set('phone')} className={INPUT} />
                </Field>
                <Field label="Company">
                  <input type="text" value={form.company} onChange={set('company')} className={INPUT} />
                </Field>
              </div>
              <Field label="Status">
                <select value={form.status} onChange={set('status')} className={INPUT}>
                  {(Object.keys(STATUS_LABELS) as ContactStatus[]).map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </Field>
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
                disabled={saving || !form.name.trim()}
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
