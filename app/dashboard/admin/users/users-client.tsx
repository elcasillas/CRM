'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, UserRole } from '@/lib/types'

const supabase = createClient()

const ROLES: UserRole[] = ['admin', 'sales', 'solutions_engineer', 'service_manager', 'read_only']

const ROLE_CLASSES: Record<UserRole, string> = {
  admin:               'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  sales:               'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  solutions_engineer:  'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  service_manager:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  read_only:           'bg-gray-100 text-gray-600',
}

type AuthUser   = { id: string; email: string; created_at: string }
type MergedUser = Profile & { email: string | null }

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm'

export function AdminUsersClient() {
  const [users, setUsers]     = useState<MergedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const [updating, setUpdating]       = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting]       = useState(false)
  const [inviteMsg, setInviteMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  const [addModal, setAddModal]   = useState(false)
  const [addForm, setAddForm]     = useState({ email: '', full_name: '', password: '', role: 'sales' as UserRole })
  const [addError, setAddError]   = useState<string | null>(null)
  const [addSaving, setAddSaving] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [profilesRes, authRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      fetch('/api/admin/users').then(r => r.json()),
    ])

    if (profilesRes.error) {
      setError(profilesRes.error.message)
      setLoading(false)
      return
    }

    if (authRes.error) {
      setError(authRes.error)
      setLoading(false)
      return
    }

    const authMap = new Map<string, AuthUser>((authRes as AuthUser[]).map(u => [u.id, u]))
    const merged: MergedUser[] = (profilesRes.data ?? []).map((p: Profile) => ({
      ...p,
      email: authMap.get(p.id)?.email ?? null,
    }))

    setUsers(merged)
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function updateRole(id: string, role: UserRole) {
    setUpdating(id)
    const res = await fetch('/api/admin/users', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId: id, role }),
    })
    if (res.ok) setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u))
    else console.error('role update failed')
    setUpdating(null)
  }

  async function handleAddUser() {
    setAddSaving(true)
    setAddError(null)
    const res = await fetch('/api/admin/users', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(addForm),
    })
    const json = await res.json()
    if (!res.ok) {
      setAddError(json.error ?? 'Failed to create user')
      setAddSaving(false)
      return
    }
    setAddModal(false)
    setAddForm({ email: '', full_name: '', password: '', role: 'sales' })
    setAddError(null)
    setAddSaving(false)
    fetchUsers()
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteMsg(null)
    const res = await fetch('/api/invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: inviteEmail.trim() }),
    })
    const json = await res.json()
    if (res.ok) {
      setInviteMsg({ ok: true, text: `Invite sent to ${inviteEmail.trim()}` })
      setInviteEmail('')
    } else {
      setInviteMsg({ ok: false, text: json.error ?? 'Failed to send invite' })
    }
    setInviting(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Users</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage roles and invite new team members.</p>
        </div>
        <button
          onClick={() => { setAddForm({ email: '', full_name: '', password: '', role: 'sales' }); setAddError(null); setAddModal(true) }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Add user
        </button>
      </div>

      {/* Invite form */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Invite new user</h3>
        <div className="flex items-center gap-3">
          <input
            type="email"
            placeholder="email@example.com"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendInvite()}
            className={`${INPUT} max-w-sm`}
          />
          <button
            onClick={sendInvite}
            disabled={inviting || !inviteEmail.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            {inviting ? 'Sending…' : 'Send invite'}
          </button>
        </div>
        {inviteMsg && (
          <p className={`text-sm mt-2 font-medium ${inviteMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
            {inviteMsg.text}
          </p>
        )}
      </div>

      {/* Users table */}
      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3.5 font-medium text-gray-900">
                    {u.full_name ?? <span className="text-gray-400 font-normal italic">No name</span>}
                  </td>
                  <td className="px-6 py-3.5 text-gray-500">
                    {u.email ?? <span className="text-gray-400 italic">—</span>}
                  </td>
                  <td className="px-6 py-3.5">
                    <select
                      value={u.role}
                      disabled={updating === u.id}
                      onChange={e => updateRole(u.id, e.target.value as UserRole)}
                      className={`text-xs font-medium px-2 py-1 rounded-md border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer disabled:opacity-60 ${ROLE_CLASSES[u.role as UserRole] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {ROLES.map(r => (
                        <option key={r} value={r}>{r.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-3.5 text-gray-400 text-xs">
                    {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Add user modal */}
      {addModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Add user</h3>
              <button onClick={() => setAddModal(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                  className={INPUT}
                  placeholder="user@example.com"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
                <input
                  type="text"
                  value={addForm.full_name}
                  onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))}
                  className={INPUT}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password *</label>
                <input
                  type="password"
                  value={addForm.password}
                  onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                  className={INPUT}
                  placeholder="Min. 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                <select
                  value={addForm.role}
                  onChange={e => setAddForm(f => ({ ...f, role: e.target.value as UserRole }))}
                  className={INPUT}
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              {addError && <p className="text-red-600 text-sm font-medium">{addError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setAddModal(false)} className="text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
              <button
                onClick={handleAddUser}
                disabled={addSaving || !addForm.email.trim() || !addForm.password.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {addSaving ? 'Creating…' : 'Create user'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
