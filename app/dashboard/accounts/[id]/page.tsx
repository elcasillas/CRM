'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type {
  Account, AccountWithOwners, Contact, Contract, DealStage, DealWithRelations,
  HidRecord, NoteWithAuthor,
} from '@/lib/types'

const supabase = createClient()

// ── Shared helpers ────────────────────────────────────────────────────────────

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTs(ts: string): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function fmtCurrency(v: number | null): string {
  if (v == null) return '—'
  const n = Number(v)
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${n.toFixed(0)}`
}

function contactName(c: Contact): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email
}

function stageBadgeClass(s: { is_won: boolean; is_lost: boolean; sort_order: number }): string {
  if (s.is_lost) return 'bg-red-50 text-red-600 ring-1 ring-red-200'
  if (s.is_won)  return 'bg-green-50 text-green-700 ring-1 ring-green-200'
  if (s.sort_order <= 3) return 'bg-gray-100 text-gray-700'
  if (s.sort_order <= 5) return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
  return 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'
}

// ── Form types ────────────────────────────────────────────────────────────────

type ContactForm = { first_name: string; last_name: string; email: string; phone: string; title: string; is_primary: boolean }
type HidForm     = { hid_number: string; dc_location: string; cluster_id: string; start_date: string; domain_name: string }
type ContractForm = { effective_date: string; renewal_date: string; renewal_term_months: string; auto_renew: boolean; status: string }
type DealForm    = { deal_name: string; stage_id: string; solutions_engineer_id: string; value_amount: string; currency: string; close_date: string; deal_notes: string }

const EMPTY_CONTACT: ContactForm  = { first_name: '', last_name: '', email: '', phone: '', title: '', is_primary: false }
const EMPTY_HID: HidForm          = { hid_number: '', dc_location: '', cluster_id: '', start_date: '', domain_name: '' }
const EMPTY_CONTRACT: ContractForm = { effective_date: '', renewal_date: '', renewal_term_months: '', auto_renew: false, status: 'active' }
const EMPTY_DEAL: DealForm        = { deal_name: '', stage_id: '', solutions_engineer_id: '', value_amount: '', currency: 'USD', close_date: '', deal_notes: '' }

type Tab = 'contacts' | 'hids' | 'contracts' | 'deals' | 'notes'

// ── Modal shell ───────────────────────────────────────────────────────────────

function Modal({ title, onClose, onSave, saving, disabled, error, children }: {
  title: string
  onClose: () => void
  onSave: () => void
  saving: boolean
  disabled?: boolean
  error: string | null
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {children}
          {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
          <button
            onClick={onSave}
            disabled={saving || disabled}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AccountDetailPage() {
  const { id }      = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const initialTab  = (searchParams.get('tab') as Tab | null) ?? 'contacts'

  const [account,   setAccount]   = useState<AccountWithOwners | null>(null)
  const [contacts,  setContacts]  = useState<Contact[]>([])
  const [hids,      setHids]      = useState<HidRecord[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [deals,     setDeals]     = useState<DealWithRelations[]>([])
  const [notes,     setNotes]     = useState<NoteWithAuthor[]>([])
  const [stages,    setStages]    = useState<DealStage[]>([])
  const [profiles,  setProfiles]  = useState<{ id: string; full_name: string | null }[]>([])
  const [userId,    setUserId]    = useState('')
  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)

  const [tab, setTab] = useState<Tab>(initialTab)

  // ── Per-entity modal state ──────────────────────────────────────────────────
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ entity: string; id: string } | null>(null)

  // contact
  const [contactModal,   setContactModal]   = useState<'add' | 'edit' | null>(null)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [contactForm,    setContactForm]    = useState<ContactForm>(EMPTY_CONTACT)

  // hid
  const [hidModal,   setHidModal]   = useState<'add' | 'edit' | null>(null)
  const [editingHid, setEditingHid] = useState<HidRecord | null>(null)
  const [hidForm,    setHidForm]    = useState<HidForm>(EMPTY_HID)

  // contract
  const [contractModal,   setContractModal]   = useState<'add' | 'edit' | null>(null)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [contractForm,    setContractForm]    = useState<ContractForm>(EMPTY_CONTRACT)

  // deal
  const [dealModal,   setDealModal]   = useState<'add' | 'edit' | null>(null)
  const [editingDeal, setEditingDeal] = useState<DealWithRelations | null>(null)
  const [dealForm,    setDealForm]    = useState<DealForm>(EMPTY_DEAL)

  // description
  const [descEditing, setDescEditing] = useState(false)
  const [descDraft,   setDescDraft]   = useState('')
  const [descSaving,  setDescSaving]  = useState(false)

  // note
  const [noteText,    setNoteText]    = useState('')
  const [loggingNote, setLoggingNote] = useState(false)

  // ── Data fetchers ───────────────────────────────────────────────────────────

  const fetchAccount = useCallback(async () => {
    const { data, error } = await supabase.from('accounts').select('*, account_owner:profiles!account_owner_id(id, full_name), service_manager:profiles!service_manager_id(id, full_name)').eq('id', id).single()
    if (error || !data) setNotFound(true)
    else setAccount(data as AccountWithOwners)
  }, [id])

  const fetchContacts = useCallback(async () => {
    const { data } = await supabase.from('contacts').select('*').eq('account_id', id).order('last_name')
    setContacts(data ?? [])
  }, [id])

  const fetchHids = useCallback(async () => {
    const { data } = await supabase.from('hid_records').select('*').eq('account_id', id).order('hid_number')
    setHids(data ?? [])
  }, [id])

  const fetchContracts = useCallback(async () => {
    const { data } = await supabase.from('contracts').select('*').eq('account_id', id).order('created_at', { ascending: false })
    setContracts(data ?? [])
  }, [id])

  const fetchDeals = useCallback(async () => {
    const { data } = await supabase
      .from('deals')
      .select('*, deal_stages(stage_name, sort_order, is_closed, is_won, is_lost), accounts(account_name), deal_owner:profiles!deal_owner_id(full_name), solutions_engineer:profiles!solutions_engineer_id(full_name)')
      .eq('account_id', id)
      .order('created_at', { ascending: false })
    setDeals((data ?? []) as DealWithRelations[])
  }, [id])

  const fetchNotes = useCallback(async () => {
    const { data } = await supabase
      .from('notes')
      .select('*, author:profiles!created_by(full_name)')
      .eq('entity_type', 'account')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
    setNotes((data ?? []) as NoteWithAuthor[])
  }, [id])

  const fetchStages = useCallback(async () => {
    const { data } = await supabase.from('deal_stages').select('*').order('sort_order')
    setStages(data ?? [])
  }, [])

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name')
    setProfiles(data ?? [])
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id) })
    Promise.all([fetchAccount(), fetchContacts(), fetchHids(), fetchContracts(), fetchDeals(), fetchNotes(), fetchStages(), fetchProfiles()])
      .then(() => setLoading(false))
  }, [fetchAccount, fetchContacts, fetchHids, fetchContracts, fetchDeals, fetchNotes, fetchStages, fetchProfiles])

  // ── Description ─────────────────────────────────────────────────────────────

  function openDesc() { setDescDraft(account?.description ?? ''); setDescEditing(true) }
  function cancelDesc() { setDescEditing(false) }

  async function saveDescription() {
    setDescSaving(true)
    const { error } = await supabase.from('accounts').update({ description: descDraft.trim() || null }).eq('id', id)
    if (!error) { setAccount(a => a ? { ...a, description: descDraft.trim() || null } : a); setDescEditing(false) }
    setDescSaving(false)
  }

  // ── Generic helpers ─────────────────────────────────────────────────────────

  function clearError() { setFormError(null) }

  function setF<T>(setter: React.Dispatch<React.SetStateAction<T>>) {
    return (field: keyof T) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setter(f => ({ ...f, [field]: e.target.value }))
  }

  // ── Contact CRUD ────────────────────────────────────────────────────────────

  function openAddContact()        { setContactForm(EMPTY_CONTACT); setEditingContact(null); clearError(); setContactModal('add') }
  function openEditContact(c: Contact) { setContactForm({ first_name: c.first_name ?? '', last_name: c.last_name ?? '', email: c.email, phone: c.phone ?? '', title: c.title ?? '', is_primary: c.is_primary }); setEditingContact(c); clearError(); setContactModal('edit') }
  function closeContactModal()     { setContactModal(null); setEditingContact(null); clearError() }

  async function saveContact() {
    setSaving(true); clearError()
    const payload = { account_id: id, first_name: contactForm.first_name.trim() || null, last_name: contactForm.last_name.trim() || null, email: contactForm.email.trim(), phone: contactForm.phone.trim() || null, title: contactForm.title.trim() || null, is_primary: contactForm.is_primary }
    const { error } = contactModal === 'add'
      ? await supabase.from('contacts').insert(payload)
      : await supabase.from('contacts').update(payload).eq('id', editingContact!.id)
    if (error) setFormError(error.message)
    else { closeContactModal(); fetchContacts() }
    setSaving(false)
  }

  // ── HID CRUD ────────────────────────────────────────────────────────────────

  function openAddHid()          { setHidForm(EMPTY_HID); setEditingHid(null); clearError(); setHidModal('add') }
  function openEditHid(h: HidRecord) { setHidForm({ hid_number: h.hid_number, dc_location: h.dc_location ?? '', cluster_id: h.cluster_id ?? '', start_date: h.start_date ?? '', domain_name: h.domain_name ?? '' }); setEditingHid(h); clearError(); setHidModal('edit') }
  function closeHidModal()       { setHidModal(null); setEditingHid(null); clearError() }

  async function saveHid() {
    setSaving(true); clearError()
    const payload = { account_id: id, hid_number: hidForm.hid_number.trim(), dc_location: hidForm.dc_location.trim() || null, cluster_id: hidForm.cluster_id.trim() || null, start_date: hidForm.start_date || null, domain_name: hidForm.domain_name.trim() || null }
    const { error } = hidModal === 'add'
      ? await supabase.from('hid_records').insert(payload)
      : await supabase.from('hid_records').update(payload).eq('id', editingHid!.id)
    if (error) setFormError(error.message)
    else { closeHidModal(); fetchHids() }
    setSaving(false)
  }

  // ── Contract CRUD ───────────────────────────────────────────────────────────

  function openAddContract()             { setContractForm(EMPTY_CONTRACT); setEditingContract(null); clearError(); setContractModal('add') }
  function openEditContract(c: Contract) { setContractForm({ effective_date: c.effective_date ?? '', renewal_date: c.renewal_date ?? '', renewal_term_months: c.renewal_term_months != null ? String(c.renewal_term_months) : '', auto_renew: c.auto_renew, status: c.status }); setEditingContract(c); clearError(); setContractModal('edit') }
  function closeContractModal()          { setContractModal(null); setEditingContract(null); clearError() }

  async function saveContract() {
    setSaving(true); clearError()
    const payload = { account_id: id, effective_date: contractForm.effective_date || null, renewal_date: contractForm.renewal_date || null, renewal_term_months: contractForm.renewal_term_months ? parseInt(contractForm.renewal_term_months) : null, auto_renew: contractForm.auto_renew, status: contractForm.status }
    const { error } = contractModal === 'add'
      ? await supabase.from('contracts').insert(payload)
      : await supabase.from('contracts').update(payload).eq('id', editingContract!.id)
    if (error) setFormError(error.message)
    else { closeContractModal(); fetchContracts() }
    setSaving(false)
  }

  // ── Deal CRUD ───────────────────────────────────────────────────────────────

  function openAddDeal()                    { setDealForm({ ...EMPTY_DEAL, stage_id: stages[1]?.id ?? '' }); setEditingDeal(null); clearError(); setDealModal('add') }
  function openEditDeal(d: DealWithRelations) { setDealForm({ deal_name: d.deal_name, stage_id: d.stage_id, solutions_engineer_id: d.solutions_engineer_id ?? '', value_amount: d.value_amount != null ? String(d.value_amount) : '', currency: d.currency, close_date: d.close_date ?? '', deal_notes: d.deal_notes ?? '' }); setEditingDeal(d); clearError(); setDealModal('edit') }
  function closeDealModal()                 { setDealModal(null); setEditingDeal(null); clearError() }

  async function saveDeal() {
    setSaving(true); clearError()
    const payload = { account_id: id, stage_id: dealForm.stage_id, deal_name: dealForm.deal_name.trim(), solutions_engineer_id: dealForm.solutions_engineer_id || null, value_amount: dealForm.value_amount ? parseFloat(dealForm.value_amount) : null, currency: dealForm.currency || 'USD', close_date: dealForm.close_date || null, deal_notes: dealForm.deal_notes.trim() || null }
    const { error } = dealModal === 'add'
      ? await supabase.from('deals').insert({ ...payload, deal_owner_id: userId })
      : await supabase.from('deals').update(payload).eq('id', editingDeal!.id)
    if (error) setFormError(error.message)
    else { closeDealModal(); fetchDeals() }
    setSaving(false)
  }

  // ── Note CRUD ───────────────────────────────────────────────────────────────

  async function addNote() {
    if (!noteText.trim()) return
    setLoggingNote(true)
    const { error } = await supabase.from('notes').insert({ entity_type: 'account', entity_id: id, note_text: noteText.trim(), created_by: userId })
    if (!error) { setNoteText(''); fetchNotes() }
    setLoggingNote(false)
  }

  // ── Generic delete ──────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!confirmDelete) return
    const { entity, id: eid } = confirmDelete
    const table = entity === 'contact' ? 'contacts' : entity === 'hid' ? 'hid_records' : entity === 'contract' ? 'contracts' : entity === 'deal' ? 'deals' : 'notes'
    const { error } = await supabase.from(table).delete().eq('id', eid)
    if (error) { console.error('delete:', error.message); setConfirmDelete(null); return }
    if (entity === 'contact')  setContacts(prev => prev.filter(x => x.id !== eid))
    if (entity === 'hid')      setHids(prev => prev.filter(x => x.id !== eid))
    if (entity === 'contract') setContracts(prev => prev.filter(x => x.id !== eid))
    if (entity === 'deal')     setDeals(prev => prev.filter(x => x.id !== eid))
    if (entity === 'note')     setNotes(prev => prev.filter(x => x.id !== eid))
    setConfirmDelete(null)
  }

  // ── Delete row actions ──────────────────────────────────────────────────────

  function DeleteActions({ entity, rowId }: { entity: string; rowId: string }) {
    const isConfirming = confirmDelete?.entity === entity && confirmDelete?.id === rowId
    return isConfirming ? (
      <>
        <span className="text-gray-400 text-xs">Delete?</span>
        <button onClick={handleDelete} className="text-xs text-red-600 hover:text-red-700 font-medium">Confirm</button>
        <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
      </>
    ) : (
      <button onClick={() => setConfirmDelete({ entity, id: rowId })} className="text-xs text-gray-400 hover:text-red-600">Delete</button>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <div className="max-w-5xl mx-auto px-6 py-8"><p className="text-gray-400 text-sm">Loading…</p></div>

  if (notFound || !account) return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <p className="text-gray-500 text-sm mb-3">Account not found.</p>
      <Link href="/dashboard/accounts" className="text-sm text-blue-600 hover:text-blue-700">← Accounts</Link>
    </div>
  )

  const STATUS_CLASSES: Record<string, string> = {
    active:   'bg-green-50 text-green-700 ring-1 ring-green-200',
    inactive: 'bg-gray-100 text-gray-600',
    churned:  'bg-red-50 text-red-600 ring-1 ring-red-200',
  }

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'contacts',  label: 'Contacts',  count: contacts.length },
    { key: 'hids',      label: 'HIDs',      count: hids.length },
    { key: 'contracts', label: 'Contracts', count: contracts.length },
    { key: 'deals',     label: 'Deals',     count: deals.length },
    { key: 'notes',     label: 'Notes',     count: notes.length },
  ]

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Back */}
      <Link href="/dashboard/accounts" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        ← Accounts
      </Link>

      {/* Account header */}
      <div className="mt-5 mb-8 bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-semibold text-gray-900">{account.account_name}</h2>
              <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_CLASSES[account.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {account.status.charAt(0).toUpperCase() + account.status.slice(1)}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500 mt-2">
              {account.account_website && (
                <a href={account.account_website} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">
                  {account.account_website.replace(/^https?:\/\//, '')}
                </a>
              )}
              {[account.city, account.region, account.country].filter(Boolean).join(', ') && (
                <span>{[account.city, account.region, account.country].filter(Boolean).join(', ')}</span>
              )}
              {[account.address_line1, account.address_line2].filter(Boolean).join(', ') && (
                <span>{[account.address_line1, account.address_line2].filter(Boolean).join(', ')}</span>
              )}
              {account.account_owner?.full_name && (
                <span>Owner: {account.account_owner.full_name}</span>
              )}
              {account.service_manager?.full_name && (
                <span>SM: {account.service_manager.full_name}</span>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          {descEditing ? (
            <div>
              <textarea
                value={descDraft}
                onChange={e => setDescDraft(e.target.value)}
                rows={3}
                placeholder="Add a description…"
                className={`${INPUT} resize-none mb-2`}
                autoFocus
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={saveDescription}
                  disabled={descSaving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  {descSaving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={cancelDesc} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={openDesc}
              className="w-full text-left group"
            >
              {account.description ? (
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap group-hover:text-gray-800">{account.description}</p>
              ) : (
                <p className="text-sm text-gray-400 italic group-hover:text-gray-500">Add a description…</p>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 text-xs text-gray-400">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Contacts tab ──────────────────────────────────────────────────────── */}
      {tab === 'contacts' && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Contacts</h3>
            <button onClick={openAddContact} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">+ Add contact</button>
          </div>
          {contacts.length === 0 ? (
            <p className="text-gray-500 text-sm">No contacts yet.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contacts.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {contactName(c)}
                        {c.is_primary && <span className="ml-2 inline-flex px-1.5 py-0 rounded text-xs font-medium bg-blue-50 text-blue-600 ring-1 ring-blue-200">Primary</span>}
                      </td>
                      <td className="px-5 py-3 text-gray-500">{c.title ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-500">{c.email}</td>
                      <td className="px-5 py-3 text-gray-500">{c.phone ?? '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3 justify-end">
                          <button onClick={() => openEditContact(c)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>
                          <DeleteActions entity="contact" rowId={c.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── HIDs tab ──────────────────────────────────────────────────────────── */}
      {tab === 'hids' && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">HID Records</h3>
            <button onClick={openAddHid} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">+ Add HID</button>
          </div>
          {hids.length === 0 ? (
            <p className="text-gray-500 text-sm">No HID records yet.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">HID #</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DC Location</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cluster ID</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Domain</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {hids.map(h => (
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{h.hid_number}</td>
                      <td className="px-5 py-3 text-gray-500">{h.dc_location ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-500">{h.cluster_id ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-500">{h.domain_name ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(h.start_date)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3 justify-end">
                          <button onClick={() => openEditHid(h)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>
                          <DeleteActions entity="hid" rowId={h.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Contracts tab ─────────────────────────────────────────────────────── */}
      {tab === 'contracts' && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Contracts</h3>
            <button onClick={openAddContract} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">+ Add contract</button>
          </div>
          {contracts.length === 0 ? (
            <p className="text-gray-500 text-sm">No contracts yet.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Effective</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Renewal</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Term</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auto Renew</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contracts.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${c.status === 'active' ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-gray-100 text-gray-600'}`}>
                          {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(c.effective_date)}</td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(c.renewal_date)}</td>
                      <td className="px-5 py-3 text-gray-500">{c.renewal_term_months != null ? `${c.renewal_term_months} mo` : '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${c.auto_renew ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                          {c.auto_renew ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3 justify-end">
                          <button onClick={() => openEditContract(c)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>
                          <DeleteActions entity="contract" rowId={c.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Deals tab ─────────────────────────────────────────────────────────── */}
      {tab === 'deals' && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Deals</h3>
            <button onClick={openAddDeal} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">+ Add deal</button>
          </div>
          {deals.length === 0 ? (
            <p className="text-gray-500 text-sm">No deals yet.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deal</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ACV</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Close Date</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SE</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {deals.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{d.deal_name}</td>
                      <td className="px-5 py-3">
                        {d.deal_stages && (
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${stageBadgeClass(d.deal_stages)}`}>
                            {d.deal_stages.stage_name}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-700 font-medium">{fmtCurrency(d.value_amount)}</td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(d.close_date)}</td>
                      <td className="px-5 py-3 text-gray-500">{d.deal_owner?.full_name ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-500">{d.solutions_engineer?.full_name ?? '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3 justify-end">
                          <button onClick={() => openEditDeal(d)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>
                          <DeleteActions entity="deal" rowId={d.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Notes tab ─────────────────────────────────────────────────────────── */}
      {tab === 'notes' && (
        <section>
          <h3 className="text-base font-semibold text-gray-900 mb-4">Notes</h3>
          {/* Add note */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-6">
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
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {loggingNote ? 'Saving…' : 'Add note'}
              </button>
            </div>
          </div>
          {/* Note list */}
          {notes.length === 0 ? (
            <p className="text-gray-500 text-sm">No notes yet.</p>
          ) : (
            <ul className="space-y-3">
              {notes.map(n => (
                <li key={n.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{n.note_text}</p>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-gray-400">
                      {n.author?.full_name ?? 'Unknown'} · {fmtTs(n.created_at)}
                    </p>
                    <div className="flex items-center gap-3">
                      <DeleteActions entity="note" rowId={n.id} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────────── */}

      {/* Contact modal */}
      {contactModal && (
        <Modal
          title={contactModal === 'add' ? 'New contact' : 'Edit contact'}
          onClose={closeContactModal} onSave={saveContact}
          saving={saving} disabled={!contactForm.email.trim()} error={formError}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="First name"><input type="text" value={contactForm.first_name} onChange={e => setContactForm(f => ({ ...f, first_name: e.target.value }))} className={INPUT} /></Field>
            <Field label="Last name"><input type="text" value={contactForm.last_name} onChange={e => setContactForm(f => ({ ...f, last_name: e.target.value }))} className={INPUT} /></Field>
          </div>
          <Field label="Email *"><input type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} className={INPUT} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone"><input type="text" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} className={INPUT} /></Field>
            <Field label="Title"><input type="text" value={contactForm.title} onChange={e => setContactForm(f => ({ ...f, title: e.target.value }))} className={INPUT} /></Field>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={contactForm.is_primary} onChange={e => setContactForm(f => ({ ...f, is_primary: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
            <span className="text-sm text-gray-700">Primary contact</span>
          </label>
        </Modal>
      )}

      {/* HID modal */}
      {hidModal && (
        <Modal
          title={hidModal === 'add' ? 'New HID record' : 'Edit HID record'}
          onClose={closeHidModal} onSave={saveHid}
          saving={saving} disabled={!hidForm.hid_number.trim()} error={formError}
        >
          <Field label="HID number *"><input type="text" value={hidForm.hid_number} onChange={e => setHidForm(f => ({ ...f, hid_number: e.target.value }))} className={INPUT} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="DC Location"><input type="text" value={hidForm.dc_location} onChange={e => setHidForm(f => ({ ...f, dc_location: e.target.value }))} className={INPUT} /></Field>
            <Field label="Cluster ID"><input type="text" value={hidForm.cluster_id} onChange={e => setHidForm(f => ({ ...f, cluster_id: e.target.value }))} className={INPUT} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date"><input type="date" value={hidForm.start_date} onChange={e => setHidForm(f => ({ ...f, start_date: e.target.value }))} className={INPUT} /></Field>
            <Field label="Domain name"><input type="text" value={hidForm.domain_name} onChange={e => setHidForm(f => ({ ...f, domain_name: e.target.value }))} className={INPUT} /></Field>
          </div>
        </Modal>
      )}

      {/* Contract modal */}
      {contractModal && (
        <Modal
          title={contractModal === 'add' ? 'New contract' : 'Edit contract'}
          onClose={closeContractModal} onSave={saveContract}
          saving={saving} error={formError}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Effective date"><input type="date" value={contractForm.effective_date} onChange={e => setContractForm(f => ({ ...f, effective_date: e.target.value }))} className={INPUT} /></Field>
            <Field label="Renewal date"><input type="date" value={contractForm.renewal_date} onChange={e => setContractForm(f => ({ ...f, renewal_date: e.target.value }))} className={INPUT} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Term (months)"><input type="number" min="1" value={contractForm.renewal_term_months} onChange={e => setContractForm(f => ({ ...f, renewal_term_months: e.target.value }))} className={INPUT} /></Field>
            <Field label="Status">
              <select value={contractForm.status} onChange={e => setContractForm(f => ({ ...f, status: e.target.value }))} className={INPUT}>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={contractForm.auto_renew} onChange={e => setContractForm(f => ({ ...f, auto_renew: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
            <span className="text-sm text-gray-700">Auto renew</span>
          </label>
        </Modal>
      )}

      {/* Deal modal */}
      {dealModal && (
        <Modal
          title={dealModal === 'add' ? 'New deal' : 'Edit deal'}
          onClose={closeDealModal} onSave={saveDeal}
          saving={saving} disabled={!dealForm.deal_name.trim() || !dealForm.stage_id} error={formError}
        >
          <Field label="Deal name *"><input type="text" value={dealForm.deal_name} onChange={e => setDealForm(f => ({ ...f, deal_name: e.target.value }))} className={INPUT} /></Field>
          <Field label="Stage *">
            <select value={dealForm.stage_id} onChange={e => setDealForm(f => ({ ...f, stage_id: e.target.value }))} className={INPUT}>
              <option value="">— select —</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
            </select>
          </Field>
          <Field label="Solutions Engineer">
            <select value={dealForm.solutions_engineer_id} onChange={e => setDealForm(f => ({ ...f, solutions_engineer_id: e.target.value }))} className={INPUT}>
              <option value="">— none —</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="ACV"><input type="number" min="0" step="100" value={dealForm.value_amount} onChange={e => setDealForm(f => ({ ...f, value_amount: e.target.value }))} placeholder="0" className={INPUT} /></Field>
            <Field label="Currency">
              <select value={dealForm.currency} onChange={e => setDealForm(f => ({ ...f, currency: e.target.value }))} className={INPUT}>
                <option value="USD">USD</option>
                <option value="CAD">CAD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </Field>
          </div>
          <Field label="Close date"><input type="date" value={dealForm.close_date} onChange={e => setDealForm(f => ({ ...f, close_date: e.target.value }))} className={INPUT} /></Field>
          <Field label="Notes"><textarea value={dealForm.deal_notes} onChange={e => setDealForm(f => ({ ...f, deal_notes: e.target.value }))} rows={3} className={`${INPUT} resize-none`} /></Field>
        </Modal>
      )}
    </div>
  )
}
