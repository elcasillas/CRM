'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { DealStage } from '@/lib/types'
import { DealWorksheet } from '@/components/deals/DealWorksheet'
import type { WorksheetData, WorksheetCalcs } from '@/components/deals/DealWorksheet'

const supabase = createClient()

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20 text-sm'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

type FormData = {
  deal_name: string
  deal_description: string
  account_id: string
  stage_id: string
  deal_owner_id: string
  solutions_engineer_id: string
  close_date: string
  region: string
  deal_type: string
}

type ProfileRow  = { id: string; full_name: string | null; role: string }
type AccountRow  = { id: string; account_name: string }

export default function NewDealPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const backHref     = searchParams.get('back') ?? '/dashboard/deals'
  const initStageId  = searchParams.get('stage_id') ?? ''

  const [loading,  setLoading]  = useState(true)
  const [stages,   setStages]   = useState<DealStage[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [userId,   setUserId]   = useState('')
  const [isAdmin,  setIsAdmin]  = useState(false)
  const [isSalesManager, setIsSalesManager] = useState(false)

  const [form,      setFormState] = useState<FormData>({
    deal_name: '', deal_description: '', account_id: '',
    stage_id: initStageId, deal_owner_id: '', solutions_engineer_id: '',
    close_date: '', region: '', deal_type: '',
  })
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const worksheetDataRef  = useRef<WorksheetData | null>(null)
  const worksheetCalcsRef = useRef<WorksheetCalcs | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id ?? ''
      setUserId(uid)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', uid).single()
      const role = profile?.role ?? ''
      setIsAdmin(role === 'admin')
      setIsSalesManager(role === 'sales_manager')

      const [{ data: stageData }, { data: acctData }, { data: profData }] = await Promise.all([
        supabase.from('deal_stages').select('*').order('sort_order'),
        supabase.from('accounts').select('id,account_name').order('account_name'),
        supabase.from('profiles').select('id,full_name,role').order('full_name'),
      ])

      const loadedStages = (stageData ?? []) as DealStage[]
      setStages(loadedStages)
      setAccounts((acctData ?? []) as AccountRow[])
      setProfiles((profData ?? []) as ProfileRow[])

      // Default stage: use query param, or second stage (index 1), or first
      const defaultStage = initStageId
        || loadedStages[1]?.id
        || loadedStages[0]?.id
        || ''

      setFormState(f => ({
        ...f,
        stage_id: f.stage_id || defaultStage,
        deal_owner_id: uid,
      }))

      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canEditOwner = isAdmin || isSalesManager

  const handleWorksheetChange = useCallback((data: WorksheetData, calcs: WorksheetCalcs) => {
    worksheetDataRef.current  = data
    worksheetCalcsRef.current = calcs
  }, [])

  async function saveDeal() {
    if (!form.deal_name.trim() || !form.stage_id) return
    setSaving(true); setSaveError(null)

    const wCalcs = worksheetCalcsRef.current
    const wData  = worksheetDataRef.current

    const payload = {
      deal_name:             form.deal_name.trim(),
      deal_description:      form.deal_description.trim() || null,
      account_id:            form.account_id || null,
      stage_id:              form.stage_id,
      deal_owner_id:         form.deal_owner_id || userId,
      solutions_engineer_id: form.solutions_engineer_id || null,
      amount:                wCalcs && wCalcs.mrr > 0               ? wCalcs.mrr               : null,
      contract_term_months:  wCalcs && wCalcs.contractTermMonths > 0 ? wCalcs.contractTermMonths : null,
      value_amount:          wCalcs && wCalcs.acv > 0               ? wCalcs.acv               : null,
      total_contract_value:  wCalcs && wCalcs.tcv > 0               ? wCalcs.tcv               : null,
      currency:              wCalcs                                  ? wCalcs.currency          : 'USD',
      worksheet_data:        wData ?? null,
      close_date:            form.close_date || null,
      region:                form.region || null,
      deal_type:             form.deal_type || null,
      last_activity_at:      new Date().toISOString(),
    }

    const { data: inserted, error } = await supabase
      .from('deals')
      .insert(payload)
      .select('id')
      .single()

    if (error) {
      setSaveError(error.message)
      setSaving(false)
      return
    }

    router.push(`/dashboard/deals/${inserted.id}?back=${encodeURIComponent(backHref)}`)
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(backHref)}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          >← Back</button>
          <h1 className="text-xl font-semibold text-gray-900">New Deal</h1>
        </div>
      </div>

      {/* Deal Information */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center px-6 py-3 bg-[#00ADB1] rounded-t-xl">
          <h2 className="font-semibold text-white">Deal Information</h2>
        </div>

        <div className="px-6 py-5 space-y-4">

          <Field label="Account">
            <div className="flex items-center gap-2">
              <select
                value={form.account_id}
                onChange={e => setFormState(f => ({ ...f, account_id: e.target.value }))}
                className={`${INPUT} flex-1`}
              >
                <option value="">— none —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
              </select>
              {form.account_id && (
                <Link href={`/dashboard/accounts/${form.account_id}`} target="_blank" rel="noopener noreferrer"
                  title="Open account" className="shrink-0 text-gray-400 hover:text-[#00ADB1] transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
                    <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
                  </svg>
                </Link>
              )}
            </div>
          </Field>

          <Field label="Deal Name *">
            <input
              type="text"
              value={form.deal_name}
              onChange={e => setFormState(f => ({ ...f, deal_name: e.target.value }))}
              placeholder="Enter deal name…"
              className={INPUT}
              autoFocus
            />
          </Field>

          <Field label="Description">
            <textarea
              value={form.deal_description}
              onChange={e => setFormState(f => ({ ...f, deal_description: e.target.value }))}
              rows={3}
              placeholder="Optional description…"
              className={`${INPUT} resize-none`}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Region">
              <select value={form.region} onChange={e => setFormState(f => ({ ...f, region: e.target.value }))} className={INPUT}>
                <option value="">— none —</option>
                <option value="North America">North America</option>
                <option value="Europe/Asia/Pacific/Africa">Europe/Asia/Pacific/Africa</option>
                <option value="Latin America/Caribbean">Latin America/Caribbean</option>
              </select>
            </Field>
            <Field label="Stage *">
              <select value={form.stage_id} onChange={e => setFormState(f => ({ ...f, stage_id: e.target.value }))} className={INPUT}>
                <option value="">— select —</option>
                {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Type of Deal">
              <select value={form.deal_type} onChange={e => setFormState(f => ({ ...f, deal_type: e.target.value }))} className={INPUT}>
                <option value="">— none —</option>
                <option value="Migration">Migration</option>
                <option value="Organic One-Time">Organic One-Time</option>
                <option value="Organic Recurring">Organic Recurring</option>
                <option value="Pro Services">Pro Services</option>
              </select>
            </Field>
            <Field label="Close Date">
              <input type="date" value={form.close_date} onChange={e => setFormState(f => ({ ...f, close_date: e.target.value }))} className={INPUT} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Deal Owner">
              {canEditOwner ? (
                <select value={form.deal_owner_id} onChange={e => setFormState(f => ({ ...f, deal_owner_id: e.target.value }))} className={INPUT}>
                  <option value="">— select —</option>
                  {profiles.filter(p => p.role === 'sales').map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>)}
                </select>
              ) : (
                <p className={`${INPUT} bg-gray-50 text-gray-600 cursor-default`}>
                  {profiles.find(p => p.id === form.deal_owner_id)?.full_name ?? '—'}
                </p>
              )}
            </Field>
            <Field label="Solutions Engineer">
              <select value={form.solutions_engineer_id} onChange={e => setFormState(f => ({ ...f, solutions_engineer_id: e.target.value }))} className={INPUT}>
                <option value="">— none —</option>
                {profiles.filter(p => p.role === 'solutions_engineer').map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>)}
              </select>
            </Field>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <button
              onClick={saveDeal}
              disabled={saving || !form.deal_name.trim() || !form.stage_id}
              className="bg-[#00ADB1] hover:bg-[#00989C] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : 'Save Deal'}
            </button>
            <button
              onClick={() => router.push(backHref)}
              disabled={saving}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-2 rounded-lg border border-gray-300 hover:border-gray-400 transition-colors"
            >
              Cancel
            </button>
            {saveError && <span className="text-sm text-red-600">{saveError}</span>}
          </div>

        </div>
      </div>

      {/* Revenue */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center px-6 py-3 bg-[#00ADB1] rounded-t-xl">
          <h2 className="font-semibold text-white">Revenue</h2>
        </div>
        <div className="px-5 py-5 overflow-x-auto">
          <DealWorksheet
            initialData={null}
            onChange={handleWorksheetChange}
          />
        </div>
      </div>

    </div>
  )
}
