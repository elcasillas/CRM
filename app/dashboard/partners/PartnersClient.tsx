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
  prospect: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
}

export default function PartnersClient() {
  const [accounts, setAccounts] = useState<AccountWithOwners[]>([])
  const [loading, setLoading]   = useState(true)
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
    if (error) console.error('partners/accounts fetch:', error.message)
    else setAccounts((data ?? []) as AccountWithOwners[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  const filtered = accounts.filter(a => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || a.account_name.toLowerCase().includes(q)
      || (a.city    ?? '').toLowerCase().includes(q)
      || (a.country ?? '').toLowerCase().includes(q)
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
      case 'website':  return a.account_website ?? null
      case 'location': return [a.city, a.country].filter(Boolean).join(', ') || null
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

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Partners</h2>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search accounts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100 w-64"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="churned">Churned</option>
          <option value="prospect">Prospect</option>
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
        <p className="text-gray-500 text-sm">No accounts found.</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-sm">No accounts match your filters.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <Th col="name"     label="Account" />
                <Th col="website"  label="Website" />
                <Th col="location" label="Location" />
                <Th col="owner"    label="Owner" />
                <Th col="manager"  label="Service Manager" />
                <Th col="status"   label="Status" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(a => (
                <tr key={a.id} className="hover:bg-brand-50 transition-colors">
                  <td className="px-6 py-3.5">
                    <Link
                      href={`/dashboard/accounts/${a.id}`}
                      className="font-medium text-gray-900 hover:text-brand-600 transition-colors"
                    >
                      {a.account_name}
                    </Link>
                  </td>
                  <td className="px-6 py-3.5 text-gray-500">
                    {a.account_website
                      ? <a href={a.account_website} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600">{a.account_website.replace(/^https?:\/\//, '')}</a>
                      : '—'}
                  </td>
                  <td className="px-6 py-3.5 text-gray-500">
                    {[a.city, a.country].filter(Boolean).join(', ') || '—'}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
