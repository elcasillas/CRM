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
  lead:     'bg-gray-100 text-gray-700',
  prospect: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  customer: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  churned:  'bg-red-50 text-red-600 ring-1 ring-red-200',
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

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export default function ContactsPage() {
  const [contacts, setContacts]           = useState<Contact[]>([])
  const [loading, setLoading]             = useState(true)
  const [modal, setModal]                 = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing]             = useState<Contact | null>(null)
  const [form, setForm]                   = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving]               = useState(false)
  const [formError, setFormError]         = useState<string | null>(null)
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
        <h2 className="text-xl font-semibold text-gray-900">Contacts</h2>
        <button
          onClick={openAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New contact
        </button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : contacts.length === 0 ? (
        <p className="text-gray-500 text-sm">No contacts yet. Add one to get started.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3.5">
                    <Link href={`/dashboard/contacts/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-6 py-3.5 text-gray-500">{c.email ?? '—'}</td>
                  <td className="px-6 py-3.5 text-gray-500">{c.company ?? '—'}</td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_CLASSES[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3 justify-end">
                      {confirmDelete === c.id ? (
                        <>
                          <span className="text-gray-400 text-xs">Delete?</span>
                          <button onClick={() => handleDelete(c.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => openEdit(c)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>
                          <button onClick={() => setConfirmDelete(c.id)} className="text-xs text-gray-500 hover:text-red-600">Delete</button>
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-md">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                {modal === 'add' ? 'New contact' : 'Edit contact'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
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
              {formError && <p className="text-red-600 text-sm font-medium">{formError}</p>}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={closeModal} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
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
