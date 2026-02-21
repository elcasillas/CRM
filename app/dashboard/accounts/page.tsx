'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { AccountWithOwners } from '@/lib/types'

const supabase = createClient()

const STATUS_CLASSES: Record<string, string> = {
  active:   'bg-green-50 text-green-700 ring-1 ring-green-200',
  inactive: 'bg-gray-100 text-gray-600',
  churned:  'bg-red-50 text-red-600 ring-1 ring-red-200',
}

type FormData = {
  account_name:     string
  account_website:  string
  address_line1:    string
  address_line2:    string
  city:             string
  region:           string
  postal:           string
  country:          string
  status:           string
  account_owner_id: string
}

const EMPTY_FORM: FormData = {
  account_name: '', account_website: '', address_line1: '', address_line2: '',
  city: '', region: '', postal: '', country: '', status: 'active', account_owner_id: '',
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

export default function AccountsPage() {
  const [accounts, setAccounts]           = useState<AccountWithOwners[]>([])
  const [profiles, setProfiles]           = useState<{ id: string; full_name: string | null }[]>([])
  const [isAdmin, setIsAdmin]             = useState(false)
  const [loading, setLoading]             = useState(true)
  const [modal, setModal]                 = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing]             = useState<AccountWithOwners | null>(null)
  const [form, setForm]                   = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving]               = useState(false)
  const [formError, setFormError]         = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Filter state
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('accounts')
      .select('*, account_owner:profiles!account_owner_id(id, full_name), service_manager:profiles!service_manager_id(id, full_name)')
      .order('account_name')
    if (error) console.error('accounts fetch:', error.message)
    else setAccounts((data ?? []) as AccountWithOwners[])
    setLoading(false)
  }, [])

  const fetchProfiles = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name')
    setProfiles(data ?? [])
    const me = (data ?? []).find(p => p.id === user?.id)
    setIsAdmin(me?.role === 'admin')
  }, [])

  useEffect(() => { Promise.all([fetchAccounts(), fetchProfiles()]) }, [fetchAccounts, fetchProfiles])

  const filtered = accounts.filter(a => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || a.account_name.toLowerCase().includes(q)
      || (a.city ?? '').toLowerCase().includes(q)
      || (a.country ?? '').toLowerCase().includes(q)
    const matchStatus = !filterStatus || a.status === filterStatus
    return matchSearch && matchStatus
  })

  function openAdd() {
    setForm(EMPTY_FORM); setEditing(null); setFormError(null); setModal('add')
  }

  function openEdit(a: AccountWithOwners) {
    setForm({
      account_name:     a.account_name,
      account_website:  a.account_website  ?? '',
      address_line1:    a.address_line1    ?? '',
      address_line2:    a.address_line2    ?? '',
      city:             a.city             ?? '',
      region:           a.region           ?? '',
      postal:           a.postal           ?? '',
      country:          a.country          ?? '',
      status:           a.status,
      account_owner_id: a.account_owner_id,
    })
    setEditing(a); setFormError(null); setModal('edit')
  }

  function closeModal() { setModal(null); setEditing(null); setFormError(null) }

  function set(field: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSave() {
    setSaving(true)
    setFormError(null)
    const payload = {
      account_name:    form.account_name.trim(),
      account_website: form.account_website.trim() || null,
      address_line1:   form.address_line1.trim()   || null,
      address_line2:   form.address_line2.trim()   || null,
      city:            form.city.trim()             || null,
      region:          form.region.trim()           || null,
      postal:          form.postal.trim()           || null,
      country:         form.country.trim()          || null,
      status:          form.status,
      ...(isAdmin && modal === 'edit' && form.account_owner_id ? { account_owner_id: form.account_owner_id } : {}),
    }
    if (modal === 'add') {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('accounts').insert({ ...payload, account_owner_id: user!.id })
      if (error) { setFormError(error.message) } else { closeModal(); fetchAccounts() }
    } else if (modal === 'edit' && editing) {
      const { error } = await supabase.from('accounts').update(payload).eq('id', editing.id)
      if (error) { setFormError(error.message) } else { closeModal(); fetchAccounts() }
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('accounts').delete().eq('id', id)
    if (error) console.error('delete:', error.message)
    else setAccounts(prev => prev.filter(a => a.id !== id))
    setConfirmDelete(null)
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Accounts</h2>
        <button
          onClick={openAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New account
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search accounts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 w-64"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="churned">Churned</option>
        </select>
        {(search || filterStatus) && (
          <button
            onClick={() => { setSearch(''); setFilterStatus('') }}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
        {!loading && (search || filterStatus) && (
          <span className="text-sm text-gray-400">{filtered.length} of {accounts.length}</span>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="text-gray-500 text-sm">No accounts yet. Add one to get started.</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-sm">No accounts match your filters.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Website</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(a => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3.5">
                    <Link href={`/dashboard/accounts/${a.id}`} className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                      {a.account_name}
                    </Link>
                  </td>
                  <td className="px-6 py-3.5 text-gray-500">
                    {a.account_website
                      ? <a href={a.account_website} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">{a.account_website.replace(/^https?:\/\//, '')}</a>
                      : '—'}
                  </td>
                  <td className="px-6 py-3.5 text-gray-500">
                    {[a.city, a.country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-6 py-3.5 text-gray-500">
                    {a.account_owner?.full_name ?? '—'}
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_CLASSES[a.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3 justify-end">
                      {confirmDelete === a.id ? (
                        <>
                          <span className="text-gray-400 text-xs">Delete?</span>
                          <button onClick={() => handleDelete(a.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => openEdit(a)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>
                          <button onClick={() => setConfirmDelete(a.id)} className="text-xs text-gray-500 hover:text-red-600">Delete</button>
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
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">{modal === 'add' ? 'New account' : 'Edit account'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <Field label="Account name *">
                <input type="text" value={form.account_name} onChange={set('account_name')} className={INPUT} />
              </Field>
              <Field label="Website">
                <input type="url" value={form.account_website} onChange={set('account_website')} placeholder="https://" className={INPUT} />
              </Field>
              <Field label="Address line 1">
                <input type="text" value={form.address_line1} onChange={set('address_line1')} className={INPUT} />
              </Field>
              <Field label="Address line 2">
                <input type="text" value={form.address_line2} onChange={set('address_line2')} className={INPUT} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="City">
                  <input type="text" value={form.city} onChange={set('city')} className={INPUT} />
                </Field>
                <Field label="Region / State">
                  <input type="text" value={form.region} onChange={set('region')} className={INPUT} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Postal code">
                  <input type="text" value={form.postal} onChange={set('postal')} className={INPUT} />
                </Field>
                <Field label="Country">
                  <input type="text" value={form.country} onChange={set('country')} className={INPUT} />
                </Field>
              </div>
              <Field label="Status">
                <select value={form.status} onChange={set('status')} className={INPUT}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="churned">Churned</option>
                </select>
              </Field>
              {isAdmin && modal === 'edit' && (
                <Field label="Account owner">
                  <select value={form.account_owner_id} onChange={set('account_owner_id')} className={INPUT}>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
                    ))}
                  </select>
                </Field>
              )}
              {formError && <p className="text-red-600 text-sm font-medium">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={closeModal} className="text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.account_name.trim()}
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
