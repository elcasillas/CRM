'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

// ── Pill color maps (identical to Account Detail page) ────────────────────────

const ROLE_COLOR: Record<string, string> = {
  primary:   'bg-[#E6F7F8] text-[#00ADB1] ring-1 ring-[#00ADB1]/30',
  billing:   'bg-green-50 text-green-700 ring-1 ring-green-200',
  marketing: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  support:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  technical: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
}

const ROLE_LABEL: Record<string, string> = {
  primary: 'Primary', billing: 'Billing', marketing: 'Marketing', support: 'Support', technical: 'Technical',
}

const CONTACT_ROLE_COLOR: Record<string, string> = {
  'Champion':       'bg-green-50 text-green-700 ring-1 ring-green-200',
  'Decision Maker': 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  'Influencer':     'bg-[#E6F7F8] text-[#00ADB1] ring-1 ring-[#00ADB1]/30',
  'Blocker':        'bg-red-50 text-red-600 ring-1 ring-red-200',
}

const CONTACT_STATUS_COLOR: Record<string, string> = {
  'Active':   'bg-green-50 text-green-700 ring-1 ring-green-200',
  'Prospect': 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  'Inactive': 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
}

function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

const AVATAR_COLORS = ['#00ADB1', '#00989C', '#33C3C7', '#3A86FF', '#FFC857', '#B1005A']

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ContactRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  title: string | null
  role: string | null
  status: string
  account_id: string | null
  contact_roles: { role_type: string }[]
  accounts: { id: string; account_name: string } | null
}

function contactDisplayName(c: ContactRow): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    supabase
      .from('contacts')
      .select('*, contact_roles(role_type), accounts(id, account_name)')
      .order('last_name')
      .then(({ data }) => {
        setContacts((data ?? []) as ContactRow[])
        setLoading(false)
      })
  }, [])

  const filtered = search.trim()
    ? contacts.filter(c => {
        const q = search.toLowerCase()
        return (
          contactDisplayName(c).toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.title ?? '').toLowerCase().includes(q) ||
          (c.accounts?.account_name ?? '').toLowerCase().includes(q)
        )
      })
    : contacts

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Contacts</h1>
          <span className="text-sm text-gray-400">{contacts.length.toLocaleString('en-US')}</span>
        </div>
        <input
          type="search"
          placeholder="Search contacts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-56 bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {search.trim() ? 'No contacts match your search.' : 'No contacts yet.'}
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => {
                const name = contactDisplayName(c)
                return (
                  <tr key={c.id} className="hover:bg-[#E6F7F8]">

                    {/* Name + email + avatar */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ring-2 ring-white/20"
                          style={{ backgroundColor: getAvatarColor(name) }}
                          title={name}
                        >
                          {getInitials(name)}
                        </div>
                        <div className="min-w-0 flex flex-col">
                          {c.account_id ? (
                            <Link
                              href={`/dashboard/accounts/${c.account_id}?tab=contacts`}
                              className="font-medium text-gray-900 hover:text-[#00ADB1] transition-colors truncate"
                            >
                              {name}
                            </Link>
                          ) : (
                            <span className="font-medium text-gray-900 truncate">{name}</span>
                          )}
                          <span className="text-sm text-gray-500 mt-0.5 break-all">{c.email}</span>
                        </div>
                      </div>
                    </td>

                    {/* Title + account name */}
                    <td className="px-5 py-3">
                      <div className="flex flex-col">
                        <span className="text-gray-900">{c.title ?? <span className="text-gray-400">—</span>}</span>
                        {c.accounts ? (
                          <Link
                            href={`/dashboard/accounts/${c.accounts.id}`}
                            className="text-sm text-gray-500 mt-0.5 hover:text-[#00ADB1] transition-colors"
                          >
                            {c.accounts.account_name}
                          </Link>
                        ) : (
                          <span className="text-sm text-gray-400 mt-0.5">—</span>
                        )}
                      </div>
                    </td>

                    {/* Type pills */}
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.contact_roles.length === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          c.contact_roles.map(r => (
                            <span key={r.role_type} className={`inline-flex px-1.5 py-0 rounded text-xs font-medium ${ROLE_COLOR[r.role_type] ?? 'bg-gray-100 text-gray-600'}`}>
                              {ROLE_LABEL[r.role_type] ?? r.role_type}
                            </span>
                          ))
                        )}
                      </div>
                    </td>

                    {/* Role pill */}
                    <td className="px-5 py-3">
                      {c.role
                        ? <span className={`inline-flex px-1.5 py-0 rounded text-xs font-medium ${CONTACT_ROLE_COLOR[c.role] ?? 'bg-gray-100 text-gray-600'}`}>{c.role}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>

                    {/* Status pill */}
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-1.5 py-0 rounded text-xs font-medium ${CONTACT_STATUS_COLOR[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {c.status}
                      </span>
                    </td>

                    {/* Phone */}
                    <td className="px-5 py-3 text-gray-500">{c.phone ?? '—'}</td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
