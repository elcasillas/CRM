'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { parseAmount, calcACV, calcTCV } from '@/lib/dealCalc'
import type { DealStage, NoteWithAuthor } from '@/lib/types'

const supabase = createClient()

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100 text-sm'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null || isNaN(Number(v))) return '—'
  const n = Number(v)
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${n.toFixed(0)}`
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTs(ts: string): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function healthBadgeClass(score: number | null): string {
  if (score == null) return 'bg-gray-100 text-gray-400'
  if (score >= 80) return 'bg-green-100 text-green-700'
  if (score >= 60) return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-600'
}

function stageBadgeClass(s: Pick<DealStage, 'is_won' | 'is_lost' | 'sort_order'> | null): string {
  if (!s) return 'bg-gray-100 text-gray-600'
  if (s.is_lost) return 'bg-red-50 text-red-600 ring-1 ring-red-200'
  if (s.is_won)  return 'bg-green-50 text-green-700 ring-1 ring-green-200'
  if (s.sort_order <= 3) return 'bg-gray-100 text-gray-700'
  if (s.sort_order <= 5) return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
  return 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'
}

type DealData = {
  id: string
  deal_name: string
  deal_description: string | null
  account_id: string | null
  stage_id: string
  deal_owner_id: string
  solutions_engineer_id: string | null
  amount: number | null
  contract_term_months: number | null
  total_contract_value: number | null
  value_amount: number | null
  currency: string
  close_date: string | null
  region: string | null
  deal_type: string | null
  last_activity_at: string | null
  created_at: string
  updated_at: string | null
  health_score: number | null
  accounts: { account_name: string } | null
  deal_stages: Pick<DealStage, 'stage_name' | 'sort_order' | 'is_closed' | 'is_won' | 'is_lost'> | null
  deal_owner: { id: string; full_name: string | null; slack_member_id: string | null } | null
  solutions_engineer: { id: string; full_name: string | null } | null
}

type ProfileRow = { id: string; full_name: string | null; role: string; slack_member_id: string | null }
type AccountRow = { id: string; account_name: string }

type FormData = {
  deal_name: string
  deal_description: string
  account_id: string
  stage_id: string
  deal_owner_id: string
  solutions_engineer_id: string
  amount: string
  contract_term_months: string
  currency: string
  close_date: string
  region: string
  deal_type: string
}

export default function DealDetailPage() {
  const { id }      = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router      = useRouter()
  const backHref    = searchParams.get('back') ?? '/dashboard/deals'

  const [deal,     setDeal]     = useState<DealData | null>(null)
  const [notes,    setNotes]    = useState<NoteWithAuthor[]>([])
  const [stages,   setStages]   = useState<DealStage[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Role
  const [isAdmin,        setIsAdmin]        = useState(false)
  const [isSalesManager, setIsSalesManager] = useState(false)
  const [userId,         setUserId]         = useState('')

  // Edit form
  const [form,      setFormState] = useState<FormData | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved,     setSaved]     = useState(false)

  // Notes form
  const [noteText,       setNoteText]       = useState('')
  const [loggingNote,    setLoggingNote]    = useState(false)
  const [confirmDeleteNote, setConfirmDeleteNote] = useState<string | null>(null)

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false)

  // ── Data fetchers ──────────────────────────────────────────────────────────

  const fetchDeal = useCallback(async () => {
    const { data, error } = await supabase
      .from('deals')
      .select('*, deal_stages(*), accounts(account_name), deal_owner:profiles!deal_owner_id(id,full_name,slack_member_id), solutions_engineer:profiles!solutions_engineer_id(id,full_name)')
      .eq('id', id)
      .single()
    if (error || !data) { setNotFound(true); return }
    setDeal(data as unknown as DealData)
    setFormState({
      deal_name:             data.deal_name,
      deal_description:      data.deal_description ?? '',
      account_id:            data.account_id ?? '',
      stage_id:              data.stage_id,
      deal_owner_id:         data.deal_owner_id,
      solutions_engineer_id: data.solutions_engineer_id ?? '',
      amount:                data.amount != null ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(data.amount)) : '',
      contract_term_months:  data.contract_term_months != null ? String(data.contract_term_months) : '',
      currency:              data.currency,
      close_date:            data.close_date ?? '',
      region:                (data as unknown as DealData).region ?? '',
      deal_type:             (data as unknown as DealData).deal_type ?? '',
    })
  }, [id])

  const fetchNotes = useCallback(async () => {
    const { data } = await supabase
      .from('notes')
      .select('*, author:profiles!created_by(full_name)')
      .eq('entity_type', 'deal')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
    setNotes((data ?? []) as NoteWithAuthor[])
  }, [id])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single()
      const role = profile?.role ?? ''
      setIsAdmin(role === 'admin')
      setIsSalesManager(role === 'sales_manager')

      await Promise.all([
        fetchDeal(),
        fetchNotes(),
        supabase.from('deal_stages').select('*').order('sort_order').then(({ data }) => setStages((data ?? []) as DealStage[])),
        supabase.from('accounts').select('id,account_name').order('account_name').then(({ data }) => setAccounts((data ?? []) as AccountRow[])),
        supabase.from('profiles').select('id,full_name,role,slack_member_id').order('full_name').then(({ data }) => setProfiles((data ?? []) as ProfileRow[])),
      ])

      setLoading(false)
    }
    init()
  }, [fetchDeal, fetchNotes])

  // ── Save deal ────────────────────────────────────────────────────────────────

  async function saveDeal() {
    if (!form || !deal) return
    setSaving(true); setSaveError(null); setSaved(false)
    const { data: { user: u } } = await supabase.auth.getUser()
    const amountNum = parseAmount(form.amount)
    const termNum   = Math.max(0, Math.floor(parseFloat(form.contract_term_months) || 0))
    const prevStageId = deal.stage_id
    const payload = {
      deal_name:             form.deal_name.trim(),
      deal_description:      form.deal_description.trim() || null,
      account_id:            form.account_id || null,
      stage_id:              form.stage_id,
      deal_owner_id:         form.deal_owner_id,
      solutions_engineer_id: form.solutions_engineer_id || null,
      amount:                amountNum > 0 ? amountNum : null,
      contract_term_months:  termNum   > 0 ? termNum   : null,
      value_amount:          amountNum > 0 ? calcACV(form.amount, form.contract_term_months) : null,
      total_contract_value:  amountNum > 0 && termNum > 0 ? amountNum * termNum : null,
      currency:              form.currency || 'USD',
      close_date:            form.close_date || null,
      region:                form.region || null,
      deal_type:             form.deal_type || null,
      last_activity_at:      new Date().toISOString(),
    }
    const { error } = await supabase.from('deals').update(payload).eq('id', id)
    if (error) {
      setSaveError(error.message)
    } else {
      if (form.stage_id !== prevStageId) {
        await supabase.from('deal_stage_history').insert({
          deal_id: id, from_stage_id: prevStageId, to_stage_id: form.stage_id, changed_by: u!.id,
        })
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      await fetchDeal()
    }
    setSaving(false)
  }

  // ── Notes ────────────────────────────────────────────────────────────────────

  async function addNote() {
    if (!noteText.trim()) return
    setLoggingNote(true)
    const { error } = await supabase.from('notes').insert({
      entity_type: 'deal', entity_id: id, note_text: noteText.trim(), created_by: userId,
    })
    if (!error) { setNoteText(''); fetchNotes() }
    setLoggingNote(false)
  }

  async function deleteNote(noteId: string) {
    await supabase.from('notes').delete().eq('id', noteId)
    setNotes(prev => prev.filter(n => n.id !== noteId))
    setConfirmDeleteNote(null)
  }

  // ── Delete deal ──────────────────────────────────────────────────────────────

  async function deleteDeal() {
    const { error } = await supabase.from('deals').delete().eq('id', id)
    if (!error) router.push(backHref)
    else console.error('delete deal:', error.message)
    setConfirmDelete(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  if (notFound || !deal || !form) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <p className="text-gray-500">Deal not found.</p>
        <Link href="/dashboard/deals" className="text-brand-600 hover:text-brand-700 text-sm mt-2 inline-block">← Back to Deals</Link>
      </div>
    )
  }

  const canEditOwner = isAdmin || isSalesManager

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={backHref} className="text-sm text-gray-400 hover:text-gray-600 transition-colors shrink-0">← Back</Link>
          <h1 className="text-xl font-semibold text-gray-900 truncate">{deal.deal_name}</h1>
          {deal.deal_stages && (
            <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-md ${stageBadgeClass(deal.deal_stages)}`}>
              {deal.deal_stages.stage_name}
            </span>
          )}
          {deal.health_score != null && (
            <span className={`shrink-0 inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold ${healthBadgeClass(deal.health_score)}`}>
              {deal.health_score}
            </span>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            {confirmDelete ? (
              <>
                <span className="text-xs text-gray-400">Delete this deal?</span>
                <button onClick={deleteDeal} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-sm text-gray-400 hover:text-red-600 transition-colors">Delete</button>
            )}
          </div>
        )}
      </div>

      {/* Deal Fields */}
      <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
            <Field label="Deal Name">
              <input type="text" value={form.deal_name} onChange={e => setFormState(f => f && ({ ...f, deal_name: e.target.value }))} className={INPUT} />
            </Field>

            <Field label="Account">
              <div className="flex items-center gap-2">
                <select value={form.account_id} onChange={e => setFormState(f => f && ({ ...f, account_id: e.target.value }))} className={`${INPUT} flex-1`}>
                  <option value="">— none —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                </select>
                {form.account_id && (
                  <Link href={`/dashboard/accounts/${form.account_id}`} target="_blank" rel="noopener noreferrer" title="Open account" className="shrink-0 text-gray-400 hover:text-brand-600 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" /><path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" /></svg>
                  </Link>
                )}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Stage">
                <select value={form.stage_id} onChange={e => setFormState(f => f && ({ ...f, stage_id: e.target.value }))} className={INPUT}>
                  <option value="">— select —</option>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
                </select>
              </Field>
              <Field label="Deal Owner">
                {canEditOwner ? (
                  <select value={form.deal_owner_id} onChange={e => setFormState(f => f && ({ ...f, deal_owner_id: e.target.value }))} className={INPUT}>
                    {profiles.filter(p => p.role === 'sales').map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>)}
                  </select>
                ) : (
                  <p className={`${INPUT} bg-gray-50 text-gray-600 cursor-default`}>{profiles.find(p => p.id === form.deal_owner_id)?.full_name ?? '—'}</p>
                )}
              </Field>
            </div>

            <Field label="Solutions Engineer">
              <select value={form.solutions_engineer_id} onChange={e => setFormState(f => f && ({ ...f, solutions_engineer_id: e.target.value }))} className={INPUT}>
                <option value="">— none —</option>
                {profiles.filter(p => p.role === 'solutions_engineer').map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount">
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm pointer-events-none">$</span>
                  <input type="text" value={form.amount} onChange={e => setFormState(f => f && ({ ...f, amount: e.target.value }))} placeholder="0" className={`${INPUT} pl-6`} />
                </div>
              </Field>
              <Field label="Currency">
                <select value={form.currency} onChange={e => setFormState(f => f && ({ ...f, currency: e.target.value }))} className={INPUT}>
                  <option value="USD">USD</option>
                  <option value="CAD">CAD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="MXN">MXN</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Contract Term (months)">
                <input type="number" min="1" step="1" value={form.contract_term_months} onChange={e => setFormState(f => f && ({ ...f, contract_term_months: e.target.value }))} placeholder="" className={INPUT} />
              </Field>
              <Field label="Close Date">
                <input type="date" value={form.close_date} onChange={e => setFormState(f => f && ({ ...f, close_date: e.target.value }))} className={INPUT} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="ACV (auto)">
                <p className={`${INPUT} bg-gray-50 text-gray-600 cursor-default`}>{form.amount ? (fmtCurrency(calcACV(form.amount, form.contract_term_months))) : '—'}</p>
              </Field>
              <Field label="Total Contract Value (auto)">
                <p className={`${INPUT} bg-gray-50 text-gray-600 cursor-default`}>{form.amount && form.contract_term_months ? (fmtCurrency(calcTCV(form.amount, form.contract_term_months))) : '—'}</p>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Region">
                <select value={form.region} onChange={e => setFormState(f => f && ({ ...f, region: e.target.value }))} className={INPUT}>
                  <option value="">— none —</option>
                  <option value="North America">North America</option>
                  <option value="Europe/Asia/Pacific/Africa">Europe/Asia/Pacific/Africa</option>
                  <option value="Latin America/Caribbean">Latin America/Caribbean</option>
                </select>
              </Field>
              <Field label="Type of Deal">
                <select value={form.deal_type} onChange={e => setFormState(f => f && ({ ...f, deal_type: e.target.value }))} className={INPUT}>
                  <option value="">— none —</option>
                  <option value="Migration">Migration</option>
                  <option value="Organic One-Time">Organic One-Time</option>
                  <option value="Organic Recurring">Organic Recurring</option>
                  <option value="Pro Services">Pro Services</option>
                </select>
              </Field>
            </div>

            <Field label="Description">
              <textarea value={form.deal_description} onChange={e => setFormState(f => f && ({ ...f, deal_description: e.target.value }))} rows={3} placeholder="Optional description…" className={`${INPUT} resize-none`} />
            </Field>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={saveDeal}
                disabled={saving || !form.deal_name.trim() || !form.stage_id}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
              {saveError && <span className="text-sm text-red-600">{saveError}</span>}
            </div>
          </div>
        </div>

      {/* Notes */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <p className="text-sm font-semibold text-gray-700 mb-4">Notes</p>
        <div className="mb-4">
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            rows={3}
            placeholder="Add a note…"
            className={`${INPUT} resize-none mb-3`}
          />
          <div className="flex justify-end">
            <button
              onClick={addNote}
              disabled={loggingNote || !noteText.trim()}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {loggingNote ? 'Saving…' : 'Add Note'}
            </button>
          </div>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-gray-400">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map(n => (
              <li key={n.id} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{n.note_text}</p>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-gray-400">{n.author?.full_name ?? 'Unknown'} · {fmtTs(n.created_at)}</p>
                  {confirmDeleteNote === n.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Delete?</span>
                      <button onClick={() => deleteNote(n.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
                      <button onClick={() => setConfirmDeleteNote(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteNote(n.id)} title="Delete" className="text-gray-400 hover:text-red-600">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C9.327 4.025 9.66 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Deal metadata */}
      <div className="mt-4 flex items-center gap-6 text-xs text-gray-400">
        {deal.created_at && <span>Created {fmtDate(deal.created_at.split('T')[0])}</span>}
        {deal.updated_at && <span>Updated {fmtDate(deal.updated_at.split('T')[0])}</span>}
        {deal.deal_owner && <span>Owner: {deal.deal_owner.full_name ?? '—'}</span>}
      </div>
    </div>
  )
}
