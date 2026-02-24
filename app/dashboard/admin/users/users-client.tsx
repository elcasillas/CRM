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
  { value: 'sales',                label: 'Sales' },
  { value: 'solutions_engineer',   label: 'Solutions Engineer' },
  { value: 'service_manager',      label: 'Service Manager' },
  { value: 'read_only',            label: 'Read Only' },
  { value: 'admin',                label: 'Admin' },
]

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm'

function roleBadgeClass(role: string) {
  switch (role) {
    case 'admin':                return 'bg-purple-50 text-purple-700 ring-1 ring-purple-200'
    case 'sales':                return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
    case 'solutions_engineer':   return 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'
    case 'service_manager':      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
    default:                     return 'bg-gray-100 text-gray-600'
  }
}

function roleLabel(value: string) {
  return ROLES.find(r => r.value === value)?.label ?? value
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type AddForm  = { email: string; full_name: string; password: string; role: string }
type EditForm = { full_name: string; email: string; role: string; new_password: string }

const EMPTY_ADD: AddForm   = { email: '', full_name: '', password: '', role: 'sales' }
const EMPTY_EDIT: EditForm = { full_name: '', email: '', role: 'sales', new_password: '' }

export function UsersClient({
  users: initialUsers,
  currentUserId,
}: {
  users: User[]
  currentUserId: string
}) {
  const [users, setUsers]         = useState(initialUsers)
  const [modal, setModal]         = useState<'add' | 'edit' | null>(null)
  const [addForm, setAddForm]     = useState<AddForm>(EMPTY_ADD)
  const [editForm, setEditForm]   = useState<EditForm>(EMPTY_EDIT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function setAdd(field: keyof AddForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setAddForm(f => ({ ...f, [field]: e.target.value }))
  }

  function setEdit(field: keyof EditForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setEditForm(f => ({ ...f, [field]: e.target.value }))
  }

  function openAdd() {
    setAddForm(EMPTY_ADD)
    setFormError(null)
    setModal('add')
  }

  function openEdit(user: User) {
    setEditForm({
      full_name:    user.full_name ?? '',
      email:        user.email ?? '',
      role:         user.role,
      new_password: '',
    })
    setEditingId(user.id)
    setFormError(null)
    setModal('edit')
  }

  function closeModal() {
    setModal(null)
    setEditingId(null)
    setFormError(null)
  }

  async function handleAdd() {
    setSaving(true)
    setFormError(null)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    const data = await res.json()
    if (!res.ok) {
      setFormError(data.error)
    } else {
      setUsers(prev => [{
        id:         data.userId,
        full_name:  addForm.full_name.trim() || null,
        role:       addForm.role,
        created_at: new Date().toISOString(),
        email:      addForm.email.trim(),
      }, ...prev])
      closeModal()
    }
    setSaving(false)
  }

  async function handleEdit() {
    if (!editingId) return
    setSaving(true)
    setFormError(null)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId:       editingId,
        full_name:    editForm.full_name,
        email:        editForm.email,
        role:         editForm.role,
        new_password: editForm.new_password || undefined,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setFormError(data.error)
    } else {
      setUsers(prev => prev.map(u =>
        u.id === editingId
          ? { ...u, full_name: editForm.full_name.trim() || null, email: editForm.email.trim(), role: editForm.role }
          : u
      ))
      closeModal()
    }
    setSaving(false)
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
          onClick={openAdd}
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
              <th className="px-4 py-3"></th>
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
                  <span className={`text-xs font-medium px-2 py-1 rounded-md ${roleBadgeClass(u.role)}`}>
                    {roleLabel(u.role)}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-gray-400 text-xs">{formatDate(u.created_at)}</td>
                <td className="px-4 py-3.5 text-right">
                  <button
                    onClick={() => openEdit(u)}
                    className="text-xs text-gray-500 hover:text-gray-800 font-medium"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="text-gray-500 text-sm px-4 py-6 text-center">No users yet.</p>
        )}
      </div>

      {/* Add User Modal */}
      {modal === 'add' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Add user</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
                <input type="email" value={addForm.email} onChange={setAdd('email')} className={INPUT} placeholder="user@example.com" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
                <input type="text" value={addForm.full_name} onChange={setAdd('full_name')} className={INPUT} placeholder="Jane Smith" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password *</label>
                <input type="password" value={addForm.password} onChange={setAdd('password')} className={INPUT} placeholder="Min. 6 characters" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                <select value={addForm.role} onChange={setAdd('role')} className={INPUT}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {formError && <p className="text-red-600 text-sm font-medium">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={closeModal} className="text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
              <button
                onClick={handleAdd}
                disabled={saving || !addForm.email.trim() || !addForm.password.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? 'Creating…' : 'Create user'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {modal === 'edit' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Edit user</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
                <input type="text" value={editForm.full_name} onChange={setEdit('full_name')} className={INPUT} placeholder="Jane Smith" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input type="email" value={editForm.email} onChange={setEdit('email')} className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                <select value={editForm.role} onChange={setEdit('role')} className={INPUT}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  New password <span className="text-gray-400 font-normal">(leave blank to keep current)</span>
                </label>
                <input type="password" value={editForm.new_password} onChange={setEdit('new_password')} className={INPUT} placeholder="Min. 6 characters" />
              </div>
              {formError && <p className="text-red-600 text-sm font-medium">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={closeModal} className="text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
              <button
                onClick={handleEdit}
                disabled={saving || !editForm.email.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
