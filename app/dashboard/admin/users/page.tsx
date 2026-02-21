'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, UserRole } from '@/lib/types'

const supabase = createClient()

const ROLES: UserRole[] = ['admin', 'sales', 'service_manager', 'read_only']

const ROLE_CLASSES: Record<UserRole, string> = {
  admin:           'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  sales:           'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  service_manager: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  read_only:       'bg-gray-100 text-gray-600',
}

type AuthUser = { id: string; email: string; created_at: string }
type MergedUser = Profile & { email: string | null }

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm'

export default function AdminUsersPage() {
  const [users, setUsers]     = useState<MergedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const [updating, setUpdating]   = useState<string | null>(null) // profile id being updated
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting]   = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null)

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
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (error) console.error('role update:', error.message)
    else setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u))
    setUpdating(null)
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteMsg(null)
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim() }),
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
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Users</h2>
        <p className="text-sm text-gray-500 mt-0.5">Manage roles and invite new team members.</p>
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
                      className={`text-xs font-medium px-2 py-1 rounded-md border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer disabled:opacity-60 ${ROLE_CLASSES[u.role]}`}
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
    </div>
  )
}
