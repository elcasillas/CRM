'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Contact, ContactStatus, Interaction, InteractionType } from '@/lib/types'

const supabase = createClient()

const STATUS_LABELS: Record<ContactStatus, string> = {
  lead:     'Lead',
  prospect: 'Prospect',
  customer: 'Customer',
  churned:  'Churned',
}

const STATUS_CLASSES: Record<ContactStatus, string> = {
  lead:     'bg-slate-700 text-slate-200',
  prospect: 'bg-yellow-900/50 text-yellow-300',
  customer: 'bg-green-900/50 text-green-300',
  churned:  'bg-red-900/50 text-red-300',
}

const TYPE_LABELS: Record<InteractionType, string> = {
  call:    'Call',
  email:   'Email',
  meeting: 'Meeting',
  note:    'Note',
  other:   'Other',
}

const TYPE_CLASSES: Record<InteractionType, string> = {
  call:    'bg-blue-900/50 text-blue-300',
  email:   'bg-purple-900/50 text-purple-300',
  meeting: 'bg-orange-900/50 text-orange-300',
  note:    'bg-slate-700 text-slate-300',
  other:   'bg-teal-900/50 text-teal-300',
}

const INPUT = 'w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-slate-500 text-sm'

function toLocalDatetime(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleString('en-US', {
    month:  'short',
    day:    'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour:   'numeric',
    minute: '2-digit',
  })
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [contact,      setContact]      = useState<Contact | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [loading,      setLoading]      = useState(true)
  const [notFound,     setNotFound]     = useState(false)

  // Log-interaction form
  const [type,        setType]       = useState<InteractionType>('call')
  const [occurredAt,  setOccurredAt] = useState(() => toLocalDatetime())
  const [notes,       setNotes]      = useState('')
  const [logging,     setLogging]    = useState(false)
  const [logError,    setLogError]   = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const fetchContact = useCallback(async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !data) setNotFound(true)
    else setContact(data)
  }, [id])

  const fetchInteractions = useCallback(async () => {
    const { data, error } = await supabase
      .from('interactions')
      .select('*')
      .eq('contact_id', id)
      .order('occurred_at', { ascending: false })
    if (error) console.error('interactions fetch:', error.message)
    else setInteractions(data ?? [])
  }, [id])

  useEffect(() => {
    Promise.all([fetchContact(), fetchInteractions()]).then(() => setLoading(false))
  }, [fetchContact, fetchInteractions])

  async function handleLog() {
    setLogging(true)
    setLogError(null)
    const { error } = await supabase.from('interactions').insert({
      contact_id:  id,
      type,
      occurred_at: new Date(occurredAt).toISOString(),
      notes:       notes.trim() || null,
    })
    if (error) {
      setLogError(error.message)
    } else {
      setNotes('')
      setOccurredAt(toLocalDatetime())
      fetchInteractions()
    }
    setLogging(false)
  }

  async function handleDelete(interactionId: string) {
    const { error } = await supabase.from('interactions').delete().eq('id', interactionId)
    if (error) console.error('delete interaction:', error.message)
    else setInteractions(prev => prev.filter(i => i.id !== interactionId))
    setConfirmDelete(null)
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    )
  }

  if (notFound || !contact) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-slate-400 text-sm mb-3">Contact not found.</p>
        <Link href="/dashboard/contacts" className="text-sm text-slate-400 hover:text-slate-200">
          ← Back to contacts
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Back link */}
      <Link
        href="/dashboard/contacts"
        className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        ← Contacts
      </Link>

      {/* Contact header */}
      <div className="mt-5 mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl font-semibold text-slate-100">{contact.name}</h2>
          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASSES[contact.status]}`}>
            {STATUS_LABELS[contact.status]}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-400">
          {contact.company && <span>{contact.company}</span>}
          {contact.email   && <span>{contact.email}</span>}
          {contact.phone   && <span>{contact.phone}</span>}
        </div>
        {contact.notes && (
          <p className="mt-3 text-sm text-slate-400 leading-relaxed">{contact.notes}</p>
        )}
      </div>

      {/* Interactions */}
      <div className="border-t border-slate-800 pt-6">
        <h3 className="text-base font-medium text-slate-100 mb-4">Interactions</h3>

        {/* Log form */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as InteractionType)}
                className={INPUT}
              >
                {(Object.keys(TYPE_LABELS) as InteractionType[]).map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Date &amp; time</label>
              <input
                type="datetime-local"
                value={occurredAt}
                onChange={e => setOccurredAt(e.target.value)}
                className={INPUT}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="What happened?"
              className={`${INPUT} resize-none`}
            />
          </div>
          {logError && <p className="text-red-400 text-sm">{logError}</p>}
          <div className="flex justify-end">
            <button
              onClick={handleLog}
              disabled={logging}
              className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-100 text-sm font-medium px-4 py-2 rounded transition-colors"
            >
              {logging ? 'Logging…' : 'Log interaction'}
            </button>
          </div>
        </div>

        {/* Interaction list */}
        {interactions.length === 0 ? (
          <p className="text-slate-400 text-sm">No interactions logged yet.</p>
        ) : (
          <ul className="space-y-0">
            {interactions.map(i => (
              <li
                key={i.id}
                className="flex items-start gap-3 py-3 border-b border-slate-800/50 last:border-0"
              >
                <span className={`mt-0.5 shrink-0 inline-flex px-2 py-0.5 rounded text-xs font-medium ${TYPE_CLASSES[i.type]}`}>
                  {TYPE_LABELS[i.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 mb-0.5">{formatDate(i.occurred_at)}</p>
                  {i.notes && <p className="text-sm text-slate-300 leading-relaxed">{i.notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  {confirmDelete === i.id ? (
                    <>
                      <span className="text-xs text-slate-400">Delete?</span>
                      <button onClick={() => handleDelete(i.id)} className="text-xs text-red-400 hover:text-red-300">Confirm</button>
                      <button onClick={() => setConfirmDelete(null)} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelete(i.id)} className="text-xs text-slate-400 hover:text-red-400">Delete</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
