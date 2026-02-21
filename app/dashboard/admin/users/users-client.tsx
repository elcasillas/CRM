'use client'

import { useState } from 'react'

type User = {
  id: string
  full_name: string | null
  role: string
  created_at: string
  email: string | null
}

const ROLES = [
  { value: 'sales',           label: 'Sales' },
  { value: 'service_manager', label: 'Service Manager' },
  { value: 'read_only',       label: 'Read Only' },
  { value: 'admin',           label: 'Admin' },
]

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm'

function roleBadgeClass(role: string) {
  switch (role) {
    case 'admin':           return 'bg-purple-50 text-purple-700 ring-1 ring-purple-200'
    case 'sales':           return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
    case 'service_manager': return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
    default:                return 'bg-gray-100 text-gray-600'
  }
}

function roleLabel(value: string) {
  return ROLES.find(r => r.value === value)?.label ?? value
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type FormData = { email: string; full_name: string; password: string; role: string }
const EMPTY_FORM: FormData = { email: '', full_name: '', password: '', role: 'sales' }

export function UsersClient({
  users: initialUsers,
  currentUserId,
}: {
  users: User[]
  currentUserId: string
}) {
  const [users, setUsers]       = useState(initialUsers)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [roleSaving, setRoleSaving] = useState<string | null>(null)

  function set(field: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function openModal() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setModal(true)
  }

  async function handleAdd() {
    setSaving(true)
    setFormError(null)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) {
      setFormError(data.error)
    } else {
      setUsers(prev => [{
        id: data.userId,
        full_name: form.full_name.trim() || null,
        role: form.role,
        created_at: new Date().toISOString(),
        email: form.email.trim(),
      }, ...prev])
      setModal(false)
    }
    setSaving(false)
  }

  async function handleRoleChange(userId: string, newRole: string) {
    setRoleSaving(userId)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: newRole }),
    })
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    }
    setRoleSaving(null)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Users</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {users.length} member{users.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={openModal}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Add user
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{u.full_name || '—'}</span>
                    {u.id === currentUserId && (
                      <span className="text-xs text-gray-400">(you)</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-gray-500">{u.email ?? '—'}</td>
                <td className="px-4 py-3.5">
                  <select
                    value={u.role}
                    onChange={e => handleRoleChange(u.id, e.target.value)}
                    disabled={roleSaving === u.id}
                    className={`text-xs font-medium px-2 py-1 rounded-md border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer disabled:opacity-50 ${roleBadgeClass(u.role)}`}
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3.5 text-gray-400 text-xs">{formatDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="text-gray-500 text-sm px-4 py-6 text-center">No users yet.</p>
        )}
      </div>

      {/* Add User Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Add user</h3>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  className={INPUT}
                  placeholder="user@example.com"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={set('full_name')}
                  className={INPUT}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={set('password')}
                  className={INPUT}
                  placeholder="Min. 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                <select value={form.role} onChange={set('role')} className={INPUT}>
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              {formError && (
                <p className="text-red-600 text-sm font-medium">{formError}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setModal(false)}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving || !form.email.trim() || !form.password.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? 'Creating…' : 'Create user'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
