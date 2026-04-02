'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

// ── Shared constants ──────────────────────────────────────────────────────────

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20 text-sm'

const CONTACT_ROLES = ['primary', 'billing', 'marketing', 'support', 'technical'] as const

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

const AVATAR_COLORS = ['#00ADB1', '#00989C', '#33C3C7', '#3A86FF', '#FFC857', '#B1005A']

function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

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
  is_primary: boolean
  contact_roles: { role_type: string }[]
  accounts: { id: string; account_name: string } | null
}

type ContactForm = {
  first_name: string
  last_name: string
  email: string
  phone: string
  title: string
  role: string
  status: string
  roles: string[]
}

function contactDisplayName(c: ContactRow): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const [contacts,       setContacts]       = useState<ContactRow[]>([])
  const [loading,        setLoading]        = useState(true)
  const [search,         setSearch]         = useState('')

  // Edit modal
  const [editingContact, setEditingContact] = useState<ContactRow | null>(null)
  const [contactForm,    setContactForm]    = useState<ContactForm | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [formError,      setFormError]      = useState<string | null>(null)

  // ── Data fetching ─────────────────────────────────────────────────────────

  function fetchContacts() {
    supabase
      .from('contacts')
      .select('*, contact_roles(role_type), accounts(id, account_name)')
      .order('last_name')
      .then(({ data }) => {
        setContacts((data ?? []) as ContactRow[])
        setLoading(false)
      })
  }

  useEffect(() => { fetchContacts() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modal helpers ─────────────────────────────────────────────────────────

  function openEditContact(c: ContactRow) {
    setContactForm({
      first_name: c.first_name ?? '',
      last_name:  c.last_name  ?? '',
      email:      c.email,
      phone:      c.phone      ?? '',
      title:      c.title      ?? '',
      role:       c.role       ?? '',
      status:     c.status     ?? 'Active',
      roles:      c.contact_roles.map(r => r.role_type),
    })
    setEditingContact(c)
    setFormError(null)
  }

  function closeModal() {
    setEditingContact(null)
    setContactForm(null)
    setFormError(null)
  }

  async function saveContact() {
    if (!contactForm || !editingContact) return
    if (contactForm.roles.length === 0) { setFormError('At least one type must be selected'); return }
    setSaving(true); setFormError(null)

    const isPrimary = contactForm.roles.includes('primary')

    // If setting primary, clear it from other contacts on the same account
    if (isPrimary && editingContact.account_id) {
      const siblings = contacts.filter(c =>
        c.account_id === editingContact.account_id &&
        c.id !== editingContact.id &&
        c.contact_roles.some(r => r.role_type === 'primary')
      )
      for (const sibling of siblings) {
        await supabase.from('contact_roles').delete().eq('contact_id', sibling.id).eq('role_type', 'primary')
        await supabase.from('contacts').update({ is_primary: false }).eq('id', sibling.id)
      }
    }

    const payload = {
      first_name: contactForm.first_name.trim() || null,
      last_name:  contactForm.last_name.trim()  || null,
      email:      contactForm.email.trim(),
      phone:      contactForm.phone.trim()       || null,
      title:      contactForm.title.trim()       || null,
      role:       contactForm.role               || null,
      status:     contactForm.status             || 'Active',
      is_primary: isPrimary,
    }

    const { error } = await supabase.from('contacts').update(payload).eq('id', editingContact.id)
    if (error) { setFormError(error.message); setSaving(false); return }

    // Replace contact_roles
    await supabase.from('contact_roles').delete().eq('contact_id', editingContact.id)
    const { error: rolesError } = await supabase.from('contact_roles').insert(
      contactForm.roles.map(role_type => ({ contact_id: editingContact.id, role_type }))
    )
    if (rolesError) { setFormError(rolesError.message); setSaving(false); return }

    closeModal()
    fetchContacts()
    setSaving(false)
  }

  // ── Derived state ─────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

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
                          <button
                            onClick={() => openEditContact(c)}
                            className="font-medium text-gray-900 hover:text-[#00ADB1] transition-colors truncate text-left"
                          >
                            {name}
                          </button>
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

      {/* ── Edit Contact Modal ───────────────────────────────────────────────── */}
      {editingContact && contactForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-md">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-[#00ADB1] rounded-t-xl">
              <h3 className="font-semibold text-white">Edit Contact</h3>
              <button onClick={closeModal} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <Field label="First name">
                  <input type="text" value={contactForm.first_name} onChange={e => setContactForm(f => f && ({ ...f, first_name: e.target.value }))} className={INPUT} />
                </Field>
                <Field label="Last name">
                  <input type="text" value={contactForm.last_name} onChange={e => setContactForm(f => f && ({ ...f, last_name: e.target.value }))} className={INPUT} />
                </Field>
              </div>
              <Field label="Email *">
                <input type="email" value={contactForm.email} onChange={e => setContactForm(f => f && ({ ...f, email: e.target.value }))} className={INPUT} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone">
                  <input type="text" value={contactForm.phone} onChange={e => setContactForm(f => f && ({ ...f, phone: e.target.value }))} className={INPUT} />
                </Field>
                <Field label="Title">
                  <input type="text" value={contactForm.title} onChange={e => setContactForm(f => f && ({ ...f, title: e.target.value }))} className={INPUT} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Role">
                  <select value={contactForm.role} onChange={e => setContactForm(f => f && ({ ...f, role: e.target.value }))} className={INPUT}>
                    <option value="">— none —</option>
                    <option value="Champion">Champion</option>
                    <option value="Decision Maker">Decision Maker</option>
                    <option value="Influencer">Influencer</option>
                    <option value="Blocker">Blocker</option>
                  </select>
                </Field>
                <Field label="Status">
                  <select value={contactForm.status} onChange={e => setContactForm(f => f && ({ ...f, status: e.target.value }))} className={INPUT}>
                    <option value="Active">Active</option>
                    <option value="Prospect">Prospect</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </Field>
              </div>
              <Field label="Type *">
                <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                  {CONTACT_ROLES.map(role => (
                    <label key={role} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={contactForm.roles.includes(role)}
                        onChange={e => setContactForm(f => f && ({
                          ...f,
                          roles: e.target.checked ? [...f.roles, role] : f.roles.filter(r => r !== role),
                        }))}
                        className="w-4 h-4 rounded border-gray-300 text-[#00ADB1]"
                      />
                      <span className="text-sm text-gray-700">{ROLE_LABEL[role]}</span>
                    </label>
                  ))}
                </div>
              </Field>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={closeModal} disabled={saving} className="text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
              <button
                onClick={saveContact}
                disabled={saving || !contactForm.email.trim() || contactForm.roles.length === 0}
                className="bg-[#00ADB1] hover:bg-[#00989C] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
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
