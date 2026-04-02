'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formIsDirty } from '@/hooks/useUnsavedChanges'
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog'
import type { AccountWithOwners } from '@/lib/types'

const supabase = createClient()

const STATUS_CLASSES: Record<string, string> = {
  active:   'bg-green-50 text-green-700 ring-1 ring-green-200',
  inactive: 'bg-gray-100 text-gray-600',
  prospect: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  churned:  'bg-red-50 text-red-600 ring-1 ring-red-200',
}

const INDUSTRY_OPTIONS = ['Teleco', 'Cableco', 'Hoster', 'MSP', 'Marketplace', 'Virtual Office'] as const

const INDUSTRY_COLORS: Record<string, string> = {
  'Teleco':          'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  'Cableco':         'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  'Hoster':          'bg-[#E6F7F8] text-[#00ADB1] ring-1 ring-[#00ADB1]/30',
  'MSP':             'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  'Marketplace':     'bg-green-50 text-green-700 ring-1 ring-green-200',
  'Virtual Office':  'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
}

function formatRenewalDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

type FormData = {
  account_name:        string
  account_website:     string
  address_line1:       string
  address_line2:       string
  city:                string
  region:              string
  postal:              string
  country:             string
  industry:            string
  status:              string
  account_owner_id:    string
  service_manager_id:  string
}

const EMPTY_FORM: FormData = {
  account_name: '', account_website: '', address_line1: '', address_line2: '',
  city: '', region: '', postal: '', country: '', industry: '', status: 'active',
  account_owner_id: '', service_manager_id: '',
}

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20 text-sm'

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
  const [profiles, setProfiles]           = useState<{ id: string; full_name: string | null; role: string }[]>([])
  const [contractRenewalMap, setContractRenewalMap] = useState<Record<string, string>>({})
  const [isAdmin, setIsAdmin]             = useState(false)
  const [loading, setLoading]             = useState(true)
  const [modal, setModal]                 = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing]             = useState<AccountWithOwners | null>(null)
  const [form, setForm]                   = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving]               = useState(false)
  const [formError, setFormError]         = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Unsaved changes tracking
  const accountInitialRef = useRef<FormData | null>(null)
  const [showAccountWarning, setShowAccountWarning] = useState(false)
  const [viewMode, setViewMode] = useState<'view' | 'edit'>('view')
  const [warningContext, setWarningContext] = useState<'close' | 'cancel'>('close')

  // Filter state
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortCol, setSortCol] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

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

  const fetchContracts = useCallback(async () => {
    const { data } = await supabase
      .from('contracts')
      .select('account_id, renewal_date')
      .eq('status', 'active')
      .not('renewal_date', 'is', null)
      .order('renewal_date', { ascending: true })
    const map: Record<string, string> = {}
    for (const c of data ?? []) {
      if (c.account_id && c.renewal_date && !map[c.account_id]) {
        map[c.account_id] = c.renewal_date
      }
    }
    setContractRenewalMap(map)
  }, [])

  const fetchProfiles = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name')
    const list = (data ?? []) as Array<{ id: string; full_name: string | null; role: string }>
    setProfiles(list)
    const me = list.find(p => p.id === user?.id)
    setIsAdmin(me?.role === 'admin')
  }, [])

  useEffect(() => { Promise.all([fetchAccounts(), fetchProfiles(), fetchContracts()]) }, [fetchAccounts, fetchProfiles, fetchContracts])

  const filtered = accounts.filter(a => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || a.account_name.toLowerCase().includes(q)
      || (a.industry ?? '').toLowerCase().includes(q)
      || (a.account_website ?? '').toLowerCase().includes(q)
    const matchStatus = !filterStatus || a.status === filterStatus
    return matchSearch && matchStatus
  })

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  function sortVal(a: AccountWithOwners): string | null {
    switch (sortCol) {
      case 'name':     return a.account_name
      case 'industry': return a.industry ?? null
      case 'renewal':  return contractRenewalMap[a.id] ?? null
      case 'owner':    return a.account_owner?.full_name ?? null
      case 'manager':  return a.service_manager?.full_name ?? null
      case 'status':   return a.status
      default:         return null
    }
  }

  const sorted = sortCol
    ? [...filtered].sort((a, b) => {
        const va = sortVal(a), vb = sortVal(b)
        if (va == null && vb == null) return 0
        if (va == null) return 1
        if (vb == null) return -1
        const r = va.localeCompare(vb)
        return sortDir === 'asc' ? r : -r
      })
    : filtered

  function Th({ col, label }: { col: string; label: string }) {
    const active = sortCol === col
    return (
      <th
        onClick={() => toggleSort(col)}
        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
      >
        {label}
        <span className={`ml-1 ${active ? 'text-gray-700' : 'text-gray-300'}`}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </th>
    )
  }

  function openAdd() {
    setForm(EMPTY_FORM); setEditing(null); setFormError(null); setModal('add')
    accountInitialRef.current = EMPTY_FORM
    setViewMode('edit')
  }

  function openEdit(a: AccountWithOwners) {
    const formValues: FormData = {
      account_name:     a.account_name,
      account_website:  a.account_website  ?? '',
      address_line1:    a.address_line1    ?? '',
      address_line2:    a.address_line2    ?? '',
      city:             a.city             ?? '',
      region:           a.region           ?? '',
      postal:           a.postal           ?? '',
      country:          a.country          ?? '',
      industry:           a.industry         ?? '',
      status:             a.status,
      account_owner_id:   a.account_owner_id,
      service_manager_id: a.service_manager_id ?? '',
    }
    setForm(formValues)
    accountInitialRef.current = formValues
    setEditing(a); setFormError(null); setModal('edit')
    setViewMode('view')
  }

  const isAccountFormDirty = modal !== null && formIsDirty(form, accountInitialRef.current)

  function guardedCloseAccount() {
    if (isAccountFormDirty) { setWarningContext('close'); setShowAccountWarning(true); return }
    setModal(null); setEditing(null); setFormError(null); accountInitialRef.current = null; setViewMode('view')
  }

  function forceCloseAccount() {
    setModal(null); setEditing(null); setFormError(null); accountInitialRef.current = null; setShowAccountWarning(false); setViewMode('view')
  }

  function closeModal() { guardedCloseAccount() }

  function cancelEdit() {
    if (isAccountFormDirty) { setWarningContext('cancel'); setShowAccountWarning(true); return }
    setForm(accountInitialRef.current ?? EMPTY_FORM)
    setViewMode('view')
    setFormError(null)
  }

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
      industry:        form.industry                || null,
      status:          form.status,
      ...(isAdmin && modal === 'edit' && form.account_owner_id ? { account_owner_id: form.account_owner_id } : {}),
      service_manager_id: form.service_manager_id || null,
    }
    if (modal === 'add') {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('accounts').insert({ ...payload, account_owner_id: user!.id })
      if (error) { setFormError(error.message) } else { forceCloseAccount(); fetchAccounts() }
    } else if (modal === 'edit' && editing) {
      const { error } = await supabase.from('accounts').update(payload).eq('id', editing.id)
      if (error) {
        setFormError(error.message)
      } else {
        const ownerId = form.account_owner_id || editing.account_owner_id
        const ownerProfile  = profiles.find(p => p.id === ownerId)
        const managerProfile = form.service_manager_id ? profiles.find(p => p.id === form.service_manager_id) : null
        setEditing(prev => ({
          ...prev!,
          ...payload,
          account_owner_id:   ownerId,
          account_owner:      ownerProfile  ? { full_name: ownerProfile.full_name,  email: null } : prev!.account_owner,
          service_manager:    managerProfile ? { full_name: managerProfile.full_name, email: null } : null,
        } as AccountWithOwners))
        accountInitialRef.current = form
        setViewMode('view')
        setFormError(null)
        fetchAccounts()
      }
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
          className="bg-[#00ADB1] hover:bg-[#00989C] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
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
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20 w-64"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="prospect">Prospect</option>
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
                <Th col="name"     label="Account" />
                <Th col="industry" label="Industry" />
                <Th col="renewal"  label="Renewal" />
                <Th col="owner"    label="Owner" />
                <Th col="manager"  label="Service Manager" />
                <Th col="status"   label="Status" />
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(a => (
                <tr key={a.id} className="hover:bg-[#E6F7F8] transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="flex flex-col">
                      <Link href={`/dashboard/accounts/${a.id}`} className="font-medium text-gray-900 hover:text-[#00ADB1] transition-colors">
                        {a.account_name}
                      </Link>
                      {a.account_website && (
                        <a
                          href={a.account_website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-gray-500 mt-0.5 hover:text-[#00ADB1] transition-colors"
                          onClick={e => e.stopPropagation()}
                        >
                          {a.account_website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    {a.industry
                      ? <span className={`inline-flex px-1.5 py-0 rounded text-xs font-medium ${INDUSTRY_COLORS[a.industry] ?? 'bg-gray-100 text-gray-600'}`}>{a.industry}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-6 py-3.5 text-gray-500 text-sm">
                    {formatRenewalDate(contractRenewalMap[a.id])}
                  </td>
                  <td className="px-6 py-3.5 text-gray-500">
                    {a.account_owner?.full_name ?? '—'}
                  </td>
                  <td className="px-6 py-3.5 text-gray-500">
                    {a.service_manager?.full_name ?? '—'}
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_CLASSES[a.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3 justify-end">
                      {isAdmin && confirmDelete === a.id ? (
                        <>
                          <span className="text-gray-400 text-xs">Delete?</span>
                          <button onClick={() => handleDelete(a.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => openEdit(a)} title="View / Edit account" className="text-gray-400 hover:text-[#00ADB1] transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                            </svg>
                          </button>
                          {isAdmin && <button onClick={() => setConfirmDelete(a.id)} title="Delete" className="text-gray-400 hover:text-red-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C9.327 4.025 9.66 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg></button>}
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

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-[#00ADB1] rounded-t-xl">
              <h3 className="font-semibold text-white truncate">
                {modal === 'add' ? 'New Account' : viewMode === 'view' ? editing?.account_name : 'Edit Account'}
              </h3>
              <div className="flex items-center gap-3 ml-4 shrink-0">
                {modal === 'edit' && viewMode === 'view' && (
                  <button
                    onClick={() => setViewMode('edit')}
                    title="Edit account"
                    className="text-white/70 hover:text-white transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                    </svg>
                  </button>
                )}
                <button onClick={closeModal} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
              </div>
            </div>

            {/* Body — read-only view */}
            {modal === 'edit' && viewMode === 'view' && editing && (
              <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Status</p>
                    <p className="mt-0.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_CLASSES[editing.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {editing.status.charAt(0).toUpperCase() + editing.status.slice(1)}
                      </span>
                    </p>
                  </div>
                  {editing.account_website && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Website</p>
                      <p className="text-sm mt-0.5">
                        <a href={editing.account_website} target="_blank" rel="noopener noreferrer" className="text-[#00ADB1] hover:text-[#00989C] break-all">
                          {editing.account_website.replace(/^https?:\/\//, '')}
                        </a>
                      </p>
                    </div>
                  )}
                  {editing.industry && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Industry</p>
                      <p className="mt-0.5">
                        <span className={`inline-flex px-1.5 py-0 rounded text-xs font-medium ${INDUSTRY_COLORS[editing.industry] ?? 'bg-gray-100 text-gray-600'}`}>
                          {editing.industry}
                        </span>
                      </p>
                    </div>
                  )}
                  {editing.account_owner?.full_name && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Account Owner</p>
                      <p className="text-sm text-gray-900 mt-0.5">{editing.account_owner.full_name}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Service Manager</p>
                    <p className="text-sm text-gray-900 mt-0.5">{editing.service_manager?.full_name ?? '—'}</p>
                  </div>
                  {(editing.address_line1 || editing.city || editing.country) && (
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Address</p>
                      <div className="text-sm text-gray-900 mt-0.5 space-y-0.5">
                        {editing.address_line1 && <p>{editing.address_line1}</p>}
                        {editing.address_line2 && <p>{editing.address_line2}</p>}
                        {(editing.city || editing.region || editing.postal) && (
                          <p>{[editing.city, editing.region, editing.postal].filter(Boolean).join(', ')}</p>
                        )}
                        {editing.country && <p>{editing.country}</p>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Body — form (add mode or edit mode) */}
            {(modal === 'add' || viewMode === 'edit') && (
              <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <Field label="Account name *">
                  <input type="text" value={form.account_name} onChange={set('account_name')} className={INPUT} />
                </Field>
                <Field label="Website">
                  <input type="url" value={form.account_website} onChange={set('account_website')} placeholder="https://" className={INPUT} />
                </Field>
                <Field label="Industry">
                  <select value={form.industry} onChange={set('industry')} className={INPUT}>
                    <option value="">— none —</option>
                    {INDUSTRY_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
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
                    <option value="prospect">Prospect</option>
                    <option value="churned">Churned</option>
                  </select>
                </Field>
                {isAdmin && modal === 'edit' && (
                  <Field label="Account owner">
                    <select value={form.account_owner_id} onChange={set('account_owner_id')} className={INPUT}>
                      {profiles.filter(p => p.role === 'sales').map(p => (
                        <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Service Manager">
                  <select value={form.service_manager_id} onChange={set('service_manager_id')} className={INPUT}>
                    <option value="">— none —</option>
                    {profiles.filter(p => p.role === 'service_manager').map(p => (
                      <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
                    ))}
                  </select>
                </Field>
                {formError && <p className="text-red-600 text-sm font-medium">{formError}</p>}
              </div>
            )}

            {/* Footer — only shown in form mode */}
            {(modal === 'add' || viewMode === 'edit') && (
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={modal === 'add' ? closeModal : cancelEdit}
                  className="text-sm text-gray-500 hover:text-gray-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.account_name.trim()}
                  className="bg-[#00ADB1] hover:bg-[#00989C] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}

            {showAccountWarning && (
              <UnsavedChangesDialog
                onCancel={() => setShowAccountWarning(false)}
                onDiscard={() => {
                  if (warningContext === 'cancel') {
                    setForm(accountInitialRef.current ?? EMPTY_FORM)
                    setViewMode('view')
                    setFormError(null)
                    setShowAccountWarning(false)
                  } else {
                    forceCloseAccount()
                  }
                }}
                onSave={async () => { await handleSave(); setShowAccountWarning(false) }}
                saving={saving}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
