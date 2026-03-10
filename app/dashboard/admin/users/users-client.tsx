'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, UserRole } from '@/lib/types'

const supabase = createClient()

const ROLES: UserRole[] = ['admin', 'sales', 'sales_manager', 'solutions_engineer', 'service_manager', 'read_only']

const ROLE_CLASSES: Record<UserRole, string> = {
  admin:               'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  sales:               'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  sales_manager:       'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  solutions_engineer:  'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  service_manager:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  read_only:           'bg-gray-100 text-gray-600',
}

type AuthUser   = { id: string; email: string; created_at: string }
type MergedUser = Profile & { email: string | null }

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100 text-sm'

export function AdminUsersClient() {
  const [users, setUsers]     = useState<MergedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const [updating, setUpdating]         = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting]       = useState(false)
  const [inviteMsg, setInviteMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  const [addModal, setAddModal]   = useState(false)
  const [addForm, setAddForm]     = useState({ email: '', full_name: '', password: '', role: 'sales' as UserRole })
  const [addError, setAddError]   = useState<string | null>(null)
  const [addSaving, setAddSaving] = useState(false)

  const [editingUser, setEditingUser] = useState<MergedUser | null>(null)
  const [editForm, setEditForm]       = useState({ full_name: '', email: '', role: 'sales' as UserRole, new_password: '', slack_member_id: '' })
  const [editError, setEditError]     = useState<string | null>(null)
  const [editSaving, setEditSaving]   = useState(false)

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

  async function deleteUser(id: string) {
    const res = await fetch(`/api/admin/users?userId=${id}`, { method: 'DELETE' })
    if (res.ok) setUsers(prev => prev.filter(u => u.id !== id))
    else console.error('delete failed')
    setConfirmDelete(null)
  }

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

  function openEdit(u: MergedUser) {
    setEditingUser(u)
    setEditForm({ full_name: u.full_name ?? '', email: u.email ?? '', role: u.role, new_password: '', slack_member_id: u.slack_member_id ?? '' })
    setEditError(null)
  }

  async function handleEditUser() {
    if (!editingUser) return
    setEditSaving(true)
    setEditError(null)
    const res = await fetch('/api/admin/users', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId: editingUser.id, ...editForm }),
    })
    const json = await res.json()
    if (!res.ok) {
      setEditError(json.error ?? 'Failed to save changes')
      setEditSaving(false)
      return
    }
    setUsers(prev => prev.map(u => u.id === editingUser.id
      ? { ...u, full_name: editForm.full_name.trim() || null, email: editForm.email.trim() || u.email, role: editForm.role, slack_member_id: editForm.slack_member_id.trim() || null }
      : u
    ))
    setEditingUser(null)
    setEditSaving(false)
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
          className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
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
            className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slack ID</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-brand-50 transition-colors">
                  <td className="px-6 py-3.5 font-medium">
                    <button onClick={() => openEdit(u)} className="text-gray-900 hover:text-brand-600 text-left transition-colors">
                      {u.full_name ?? <span className="text-gray-400 font-normal italic">No name</span>}
                    </button>
                  </td>
                  <td className="px-6 py-3.5 text-gray-500">
                    {u.email ?? <span className="text-gray-400 italic">—</span>}
                  </td>
                  <td className="px-6 py-3.5">
                    <select
                      value={u.role}
                      disabled={updating === u.id}
                      onChange={e => updateRole(u.id, e.target.value as UserRole)}
                      className={`text-xs font-medium px-2 py-1 rounded-md border-0 focus:outline-none focus:ring-2 focus:ring-brand-200 cursor-pointer disabled:opacity-60 ${ROLE_CLASSES[u.role as UserRole] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {ROLES.map(r => (
                        <option key={r} value={r}>{r.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-3.5 text-gray-400 text-xs font-mono">
                    {u.slack_member_id ?? <span className="font-sans italic">—</span>}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    {confirmDelete === u.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-xs text-gray-400">Delete?</span>
                        <button onClick={() => deleteUser(u.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                        <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-3">
                        <button onClick={() => setConfirmDelete(u.id)} className="text-gray-400 hover:text-red-600 transition-colors" title="Delete user">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C9.327 4.025 9.66 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Edit user modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 bg-brand-700 rounded-t-xl">
              <h3 className="font-semibold text-white">Edit User</h3>
              <button onClick={() => setEditingUser(null)} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                  className={INPUT}
                  placeholder="Jane Smith"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className={INPUT}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Slack Member ID <span className="text-gray-400 font-normal">(e.g. U01234ABCDE)</span>
                </label>
                <input
                  type="text"
                  value={editForm.slack_member_id}
                  onChange={e => setEditForm(f => ({ ...f, slack_member_id: e.target.value }))}
                  className={INPUT}
                  placeholder="U01234ABCDE"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                <select
                  value={editForm.role}
                  onChange={e => setEditForm(f => ({ ...f, role: e.target.value as UserRole }))}
                  className={INPUT}
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  New password <span className="text-gray-400 font-normal">(leave blank to keep current)</span>
                </label>
                <input
                  type="password"
                  value={editForm.new_password}
                  onChange={e => setEditForm(f => ({ ...f, new_password: e.target.value }))}
                  className={INPUT}
                  placeholder="Min. 6 characters"
                />
              </div>
              {editError && <p className="text-red-600 text-sm font-medium">{editError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setEditingUser(null)} className="text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
              <button
                onClick={handleEditUser}
                disabled={editSaving || !editForm.email.trim()}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add user modal */}
      {addModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 bg-brand-700 rounded-t-xl">
              <h3 className="font-semibold text-white">Add User</h3>
              <button onClick={() => setAddModal(false)} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
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
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
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
