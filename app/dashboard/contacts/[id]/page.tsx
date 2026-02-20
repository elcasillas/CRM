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
  lead:     'bg-gray-100 text-gray-700',
  prospect: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  customer: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  churned:  'bg-red-50 text-red-600 ring-1 ring-red-200',
}

const TYPE_LABELS: Record<InteractionType, string> = {
  call:    'Call',
  email:   'Email',
  meeting: 'Meeting',
  note:    'Note',
  other:   'Other',
}

const TYPE_CLASSES: Record<InteractionType, string> = {
  call:    'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  email:   'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  meeting: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  note:    'bg-gray-100 text-gray-600',
  other:   'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
}

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm'

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
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  if (notFound || !contact) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-gray-500 text-sm mb-3">Contact not found.</p>
        <Link href="/dashboard/contacts" className="text-sm text-blue-600 hover:text-blue-700">
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
        className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        ← Contacts
      </Link>

      {/* Contact header */}
      <div className="mt-5 mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl font-semibold text-gray-900">{contact.name}</h2>
          <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_CLASSES[contact.status]}`}>
            {STATUS_LABELS[contact.status]}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
          {contact.company && <span>{contact.company}</span>}
          {contact.email   && <span>{contact.email}</span>}
          {contact.phone   && <span>{contact.phone}</span>}
        </div>
        {contact.notes && (
          <p className="mt-3 text-sm text-gray-500 leading-relaxed">{contact.notes}</p>
        )}
      </div>

      {/* Interactions */}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Interactions</h3>

        {/* Log form */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date &amp; time</label>
              <input
                type="datetime-local"
                value={occurredAt}
                onChange={e => setOccurredAt(e.target.value)}
                className={INPUT}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="What happened?"
              className={`${INPUT} resize-none`}
            />
          </div>
          {logError && <p className="text-red-600 text-sm font-medium">{logError}</p>}
          <div className="flex justify-end">
            <button
              onClick={handleLog}
              disabled={logging}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {logging ? 'Logging…' : 'Log interaction'}
            </button>
          </div>
        </div>

        {/* Interaction list */}
        {interactions.length === 0 ? (
          <p className="text-gray-500 text-sm">No interactions logged yet.</p>
        ) : (
          <ul className="space-y-0">
            {interactions.map(i => (
              <li
                key={i.id}
                className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0"
              >
                <span className={`mt-0.5 shrink-0 inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${TYPE_CLASSES[i.type]}`}>
                  {TYPE_LABELS[i.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 mb-0.5">{formatDate(i.occurred_at)}</p>
                  {i.notes && <p className="text-sm text-gray-700 leading-relaxed">{i.notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  {confirmDelete === i.id ? (
                    <>
                      <span className="text-xs text-gray-400">Delete?</span>
                      <button onClick={() => handleDelete(i.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                      <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelete(i.id)} className="text-xs text-gray-400 hover:text-red-600">Delete</button>
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
