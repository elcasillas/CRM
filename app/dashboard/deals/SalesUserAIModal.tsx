'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { copyText } from '@/lib/deal-email'

// ── Sales user follow-up modal ───────────────────────────────────────────────
// Shows follow-up content for every open deal of one salesperson. The content
// comes from the same generator as the single-deal Email and Template actions.

export interface FollowUpSection {
  dealId:       string
  dealName:     string
  lastNoteLine: string
  items:        string
  body:         string
  generatedAt:  string | null
  fromCache:    boolean
  error:        string | null
}

/** "Aug 24, 2026". Date only: no other modal header in the app shows a time. */
function fmtGeneratedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Newest generation timestamp on show. A report mixes reused and freshly
 * generated deals, so the title reports the most recent date represented.
 */
function latestGeneratedAt(sections: FollowUpSection[]): string | null {
  let newest: number | null = null
  let iso: string | null = null
  for (const s of sections) {
    if (!s.generatedAt) continue
    const ms = new Date(s.generatedAt).getTime()
    if (isNaN(ms)) continue
    if (newest === null || ms > newest) { newest = ms; iso = s.generatedAt }
  }
  return iso
}

/** "today", "3 days ago" — how old the saved items for a deal are. */
function generatedAge(iso: string | null): string | null {
  if (!iso) return null
  const then = new Date(iso)
  if (isNaN(then.getTime())) return null
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000)
  if (days <= 0) return 'generated today'
  if (days === 1) return 'generated yesterday'
  return `generated ${days} days ago`
}

interface Props {
  ownerId:   string
  ownerName: string
  onClose:   () => void
}

/** Plain text for the clipboard: deal name, note age, items, nothing else. */
function buildPlainText(sections: FollowUpSection[]): string {
  return sections
    .map(s => s.error
      ? `${s.dealName}\n${s.lastNoteLine || 'No notes available'}\n\nContent could not be generated for this deal.`
      : s.body)
    .join('\n\n\n')
}

export function SalesUserAIModal({ ownerId, ownerName, onClose }: Props) {
  const [sections, setSections] = useState<FollowUpSection[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [copied, setCopied]     = useState(false)
  const inFlight = useRef(false)

  const load = useCallback(async (force = false) => {
    // A generation already running: ignore repeat requests
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/sales-users/${ownerId}/follow-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(res.status === 403
          ? 'You do not have access to this report.'
          : (body.error ?? `Request failed (${res.status})`))
      }
      const body = await res.json()
      setSections((body.sections ?? []) as FollowUpSection[])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }, [ownerId])

  useEffect(() => { load(false) }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleCopy() {
    const ok = await copyText(buildPlainText(sections))
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }

  const failedCount = sections.filter(s => s.error).length
  const reusedCount = sections.filter(s => s.fromCache && !s.error).length
  const generatedOn = latestGeneratedAt(sections)
  const title = `${ownerName} · AI Deal Review${generatedOn ? ` · Generated ${fmtGeneratedDate(generatedOn)}` : ''}`

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#00ADB1] rounded-t-xl shrink-0">
          <div className="min-w-0">
            <h3 className="font-semibold text-white truncate" title={title}>{title}</h3>
            <p className="text-xs text-white/70 mt-0.5">
              {loading ? 'Generating…' : `${sections.length} ${sections.length === 1 ? 'deal' : 'deals'}`}
              {!loading && reusedCount > 0 && ` · ${reusedCount} reused`}
              {!loading && failedCount > 0 && ` · ${failedCount} could not be generated`}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            <button
              onClick={() => load(true)}
              disabled={loading}
              title="Regenerate every deal, ignoring saved content"
              className="text-xs font-medium text-white bg-white/15 hover:bg-white/25 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              onClick={handleCopy}
              disabled={loading || sections.length === 0}
              className="text-xs font-medium text-white bg-white/15 hover:bg-white/25 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none pl-1">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto grow">
          {loading ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Reviewing open deals for {ownerName}…</p>
              {[0, 1, 2].map(i => (
                <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-4 animate-pulse">
                  <div className="h-3.5 bg-gray-200 rounded w-1/3 mb-3" />
                  <div className="h-2.5 bg-gray-200 rounded w-1/5 mb-4" />
                  <div className="h-2.5 bg-gray-200 rounded w-full mb-2" />
                  <div className="h-2.5 bg-gray-200 rounded w-11/12" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-800 font-medium">This report could not be generated.</p>
              <p className="text-sm text-gray-500 mt-1">{error}</p>
              <button
                onClick={() => load(false)}
                className="mt-4 text-sm font-medium text-white bg-[#00ADB1] hover:bg-[#00989C] px-4 py-2 rounded-lg transition-colors"
              >
                Try again
              </button>
            </div>
          ) : sections.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">{ownerName} has no open deals.</p>
          ) : (
            <ul className="space-y-4">
              {sections.map(s => (
                <li key={s.dealId} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-900">{s.dealName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.lastNoteLine || 'No notes available'}
                    {s.fromCache && generatedAge(s.generatedAt) && (
                      <span className="text-gray-300"> · {generatedAge(s.generatedAt)}</span>
                    )}
                  </p>
                  {s.error ? (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
                      Content could not be generated for this deal.
                    </p>
                  ) : (
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap mt-3">{s.items}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>
    </div>
  )
}
