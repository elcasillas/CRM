'use client'

import { useState } from 'react'
import { CrmSidebar }   from '@/components/crm/crm-sidebar'
import { CrmTopbar }    from '@/components/crm/crm-topbar'
import { SummaryCard }  from '@/components/crm/summary-card'
import { SectionCard }  from '@/components/crm/section-card'
import { StageBadge }   from '@/components/crm/stage-badge'
import { FunnelChart }  from '@/components/dashboard/funnel-chart'
import type { DealStageRow } from '@/components/dashboard/deals-by-stage'

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_DEAL = {
  account:     'Acme Corp',
  deal_name:   'Acme — Organic Recurring Q3',
  description: 'Migration of legacy hosting stack to Hostopia cloud. Includes DNS transition and support onboarding.',
  region:      'North America',
  stage:       'Contract Negotiation',
  type:        'Organic Recurring',
  close_date:  'Sep 30, 2025',
  deal_owner:  'Sarah Chen',
  solutions_engineer: 'Marco Rossi',
}

const MOCK_REVENUE = {
  currency: 'CAD',
  term:     '12 months',
  mrr:      '$4,200',
  acv:      '$50,400',
  tcv:      '$50,400',
}

interface MockDeal {
  id:    string
  name:  string
  owner: string
  stage: string
  close: string
  acv:   string
  health: number
}

const MOCK_DEALS: MockDeal[] = [
  { id: '1', name: 'Acme — Organic Recurring Q3',   owner: 'Sarah Chen',   stage: 'Contract Negotiation', close: 'Sep 30, 2025', acv: '$50,400',  health: 88 },
  { id: '2', name: 'Globex Migration Bundle',        owner: 'James Park',   stage: 'Solution Qualified',   close: 'Oct 15, 2025', acv: '$24,000',  health: 72 },
  { id: '3', name: 'Initech Pro Services Renewal',  owner: 'Sarah Chen',   stage: 'Contract Signed',      close: 'Aug 31, 2025', acv: '$18,600',  health: 95 },
  { id: '4', name: 'Umbrella Corp Hosting Plan',    owner: 'Lena Torres',  stage: 'Short Listed',          close: 'Nov 1, 2025',  acv: '$36,000',  health: 61 },
  { id: '5', name: 'Initech Infrastructure Expand', owner: 'Marco Rossi',  stage: 'Presenting to EDM',    close: 'Oct 28, 2025', acv: '$72,000',  health: 55 },
]

const MOCK_FUNNEL_ROWS: DealStageRow[] = [
  { id: 'sq',  stage_name: 'Solution Qualified',   is_won: false, is_lost: false, count: 8,  value: 192000 },
  { id: 'pe',  stage_name: 'Presenting to EDM',    is_won: false, is_lost: false, count: 5,  value: 360000 },
  { id: 'sl',  stage_name: 'Short Listed',          is_won: false, is_lost: false, count: 4,  value: 144000 },
  { id: 'cn',  stage_name: 'Contract Negotiations', is_won: false, is_lost: false, count: 3,  value: 151200 },
  { id: 'cs',  stage_name: 'Contract Signed',       is_won: false, is_lost: false, count: 2,  value: 37200  },
  { id: 'imp', stage_name: 'Implementing',          is_won: false, is_lost: false, count: 1,  value: 24000  },
]

const MOCK_NOTES = [
  { id: 'n1', author: 'Sarah Chen',   date: 'Jul 8, 2025',  text: 'Spoke with IT director — they want to move forward pending legal review of contract terms. Expecting sign-off by end of month.' },
  { id: 'n2', author: 'Marco Rossi',  date: 'Jun 24, 2025', text: 'Technical deep-dive completed. Acme confirmed their current stack. Migration estimate: 3–4 weeks. No blockers identified.' },
  { id: 'n3', author: 'James Park',   date: 'Jun 10, 2025', text: 'Initial discovery call completed. Identified 3 decision makers. Sending follow-up deck tomorrow.' },
  { id: 'n4', author: 'Sarah Chen',   date: 'May 28, 2025', text: 'Deal created following inbound lead from Hostopia.com website. Routed to solutions engineering for scoping.' },
]

const MOCK_AI_SUMMARY = `Acme Corp is in late-stage negotiation for an Organic Recurring deal valued at $50,400 ACV. The deal has strong engagement signals — three stakeholder interactions logged in the last 45 days, a completed technical scoping session, and verbal commitment from the IT director. Legal review is the primary pending gate. Health score: 88/100.`

// ── Helpers ──────────────────────────────────────────────────────────────────

function healthColor(score: number): string {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-amber-500'
  return 'text-red-500'
}

function ViewField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-[#5F7C7D] uppercase tracking-wide">{label}</p>
      <div className="text-sm text-[#1F2A2B] mt-0.5">{children}</div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CrmSamplePage() {
  const [selectedDeal, setSelectedDeal]           = useState<string | null>('1')
  const [showHistoricalNotes, setShowHistoricalNotes] = useState(false)

  const [latest, ...older] = MOCK_NOTES

  return (
    <div className="flex min-h-screen bg-[#F8FBFB]">
      <CrmSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <CrmTopbar title="Hostopia | CRM" />

        <main className="flex-1 px-6 py-8">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* Page title */}
            <h1 className="text-xl font-semibold text-[#1F2A2B]">Design System Sample</h1>

            {/* ── Summary cards ────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard label="Active Accounts" value={142}  sub="3 inactive · 1 churned" />
              <SummaryCard label="Open Deals"      value={23}   sub="4 won all-time" />
              <SummaryCard label="Pipeline Value"  value="$1.2M" sub="across open deals" />
              <SummaryCard label="Contacts"        value={391}  sub="across all accounts" />
            </div>

            {/* ── Deal Information + Revenue (2-col on lg) ─────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Deal Information */}
              <SectionCard
                title="Deal Information"
                action={
                  <button className="text-white/70 hover:text-white transition-colors" title="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                    </svg>
                  </button>
                }
              >
                <div className="space-y-4">
                  <ViewField label="Account">
                    <span className="font-medium">{MOCK_DEAL.account}</span>
                  </ViewField>
                  <ViewField label="Deal Name">
                    <span className="font-medium">{MOCK_DEAL.deal_name}</span>
                  </ViewField>
                  <ViewField label="Description">
                    <p className="text-sm text-[#5F7C7D] leading-relaxed">{MOCK_DEAL.description}</p>
                  </ViewField>
                  <div className="grid grid-cols-2 gap-4">
                    <ViewField label="Region"><span>{MOCK_DEAL.region}</span></ViewField>
                    <ViewField label="Stage"><StageBadge stage={MOCK_DEAL.stage} /></ViewField>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <ViewField label="Type of Deal"><span>{MOCK_DEAL.type}</span></ViewField>
                    <ViewField label="Close Date"><span>{MOCK_DEAL.close_date}</span></ViewField>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <ViewField label="Deal Owner"><span>{MOCK_DEAL.deal_owner}</span></ViewField>
                    <ViewField label="Solutions Engineer"><span>{MOCK_DEAL.solutions_engineer}</span></ViewField>
                  </div>
                </div>
              </SectionCard>

              {/* Revenue */}
              <SectionCard title="Revenue">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <ViewField label="Currency"><span>{MOCK_REVENUE.currency}</span></ViewField>
                    <ViewField label="Term"><span>{MOCK_REVENUE.term}</span></ViewField>
                  </div>
                  <ViewField label="MRR Amount">
                    <span className="font-medium text-[#1F2A2B]">{MOCK_REVENUE.mrr}</span>
                  </ViewField>
                  <div className="grid grid-cols-2 gap-4">
                    <ViewField label="Annual Contract Value">
                      <span className="font-medium">{MOCK_REVENUE.acv}</span>
                    </ViewField>
                    <ViewField label="Total Contract Value">
                      <span className="font-medium">{MOCK_REVENUE.tcv}</span>
                    </ViewField>
                  </div>

                  {/* Divider + visual ACV bar */}
                  <div className="pt-2 border-t border-[#E3EAEA]">
                    <p className="text-xs font-medium text-[#5F7C7D] uppercase tracking-wide mb-2">Pipeline Progress</p>
                    <div className="space-y-2">
                      {[
                        { label: 'MRR',  pct: 28, color: 'bg-[#00ADB1]' },
                        { label: 'ACV',  pct: 68, color: 'bg-[#33C3C7]' },
                        { label: 'TCV',  pct: 100, color: 'bg-[#E3EAEA]' },
                      ].map(bar => (
                        <div key={bar.label} className="flex items-center gap-3">
                          <span className="text-xs text-[#5F7C7D] w-8 shrink-0">{bar.label}</span>
                          <div className="flex-1 bg-[#F8FBFB] rounded-full h-2 overflow-hidden">
                            <div className={`${bar.color} h-2 rounded-full`} style={{ width: `${bar.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* ── Deals table ──────────────────────────────────────────────── */}
            <SectionCard title="Open Deals" noPadding>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: '#00ADB1' }}>
                      {['Deal Name', 'Deal Owner', 'Stage', 'Close Date', 'ACV', 'Health'].map(col => (
                        <th key={col} className="px-4 py-3 text-xs font-medium text-white uppercase tracking-wider text-left">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3EAEA]">
                    {MOCK_DEALS.map((deal, idx) => {
                      const isSelected = selectedDeal === deal.id
                      return (
                        <tr
                          key={deal.id}
                          onClick={() => setSelectedDeal(deal.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#00ADB1]/10'
                              : idx % 2 === 0
                                ? 'bg-white hover:bg-[#F8FBFB]'
                                : 'bg-[#F8FBFB] hover:bg-[#EEF6F6]'
                          }`}
                        >
                          <td className="px-4 py-3.5 font-medium text-[#1F2A2B]">{deal.name}</td>
                          <td className="px-4 py-3.5 text-[#5F7C7D]">{deal.owner}</td>
                          <td className="px-4 py-3.5"><StageBadge stage={deal.stage} /></td>
                          <td className="px-4 py-3.5 text-[#5F7C7D]">{deal.close}</td>
                          <td className="px-4 py-3.5 font-medium text-[#1F2A2B]">{deal.acv}</td>
                          <td className={`px-4 py-3.5 font-semibold ${healthColor(deal.health)}`}>{deal.health}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            {/* ── Pipeline funnel + AI Summary (2-col on lg) ───────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Pipeline Funnel — reuses existing FunnelChart component */}
              <FunnelChart rows={MOCK_FUNNEL_ROWS} />

              {/* AI Summary */}
              <SectionCard
                title="AI Deal Summary"
                action={
                  <button className="text-xs font-medium text-white/80 hover:text-white border border-white/30 hover:border-white/60 rounded-md px-3 py-1 transition-colors">
                    Regenerate
                  </button>
                }
              >
                <p className="text-sm text-[#5F7C7D] leading-relaxed mb-4">{MOCK_AI_SUMMARY}</p>

                <div className="pt-4 border-t border-[#E3EAEA]">
                  <p className="text-xs font-medium text-[#5F7C7D] uppercase tracking-wide mb-3">Quick Actions</p>
                  <div className="flex flex-wrap gap-2">
                    <button className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#00ADB1] text-white hover:bg-[#00989C] transition-colors">
                      Inspect Deal
                    </button>
                    <button className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[#E3EAEA] text-[#5F7C7D] hover:text-[#1F2A2B] hover:border-[#00ADB1] transition-colors">
                      Email Owner
                    </button>
                    <button className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[#E3EAEA] text-[#5F7C7D] hover:text-[#1F2A2B] hover:border-[#00ADB1] transition-colors">
                      View in Slack
                    </button>
                  </div>
                </div>

                {/* Inspection score pills */}
                <div className="mt-4 pt-4 border-t border-[#E3EAEA]">
                  <p className="text-xs font-medium text-[#5F7C7D] uppercase tracking-wide mb-3">Inspection Signals</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: 'Stage Probability', pass: true  },
                      { label: 'Close Date Set',    pass: true  },
                      { label: 'Notes Recency',     pass: true  },
                      { label: 'ACV > Threshold',   pass: true  },
                      { label: 'Champion Named',    pass: false },
                      { label: 'Competition Known', pass: false },
                    ].map(sig => (
                      <span
                        key={sig.label}
                        className={`text-xs px-2 py-0.5 rounded ring-1 ${
                          sig.pass
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-red-50 text-red-600 ring-red-200'
                        }`}
                      >
                        {sig.pass ? '✓' : '✗'} {sig.label}
                      </span>
                    ))}
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* ── Historical Notes ─────────────────────────────────────────── */}
            <SectionCard title="Notes">
              {/* Latest note — always visible */}
              <NoteItem note={latest} />

              {older.length > 0 && (
                <>
                  <button
                    onClick={() => setShowHistoricalNotes(v => !v)}
                    className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#5F7C7D] hover:text-[#1F2A2B] transition-colors py-1"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${showHistoricalNotes ? 'rotate-180' : ''}`}
                    >
                      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                    {showHistoricalNotes ? 'Hide' : 'Show'} {older.length} previous {older.length === 1 ? 'note' : 'notes'}
                  </button>

                  {showHistoricalNotes && (
                    <div className="mt-3 space-y-3">
                      {older.map(note => <NoteItem key={note.id} note={note} />)}
                    </div>
                  )}
                </>
              )}

              {/* New note input */}
              <div className="mt-5 pt-4 border-t border-[#E3EAEA]">
                <textarea
                  rows={3}
                  placeholder="Add a note…"
                  className="w-full bg-white border border-[#E3EAEA] rounded-lg px-3 py-2 text-sm text-[#1F2A2B] placeholder-[#5F7C7D] focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20 resize-none mb-3"
                />
                <div className="flex justify-end">
                  <button className="bg-[#00ADB1] hover:bg-[#00989C] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                    Add Note
                  </button>
                </div>
              </div>
            </SectionCard>

            {/* ── Stage badge palette ───────────────────────────────────────── */}
            <SectionCard title="Stage Badge Reference">
              <div className="flex flex-wrap gap-2">
                {[
                  'Solution Qualified',
                  'Presenting to EDM',
                  'Short Listed',
                  'Contract Negotiation',
                  'Contract Signed',
                  'Implementing',
                  'Closed Won',
                  'Closed Lost',
                ].map(s => <StageBadge key={s} stage={s} />)}
              </div>
            </SectionCard>

          </div>
        </main>
      </div>
    </div>
  )
}

// ── Sub-component (scoped to this page) ──────────────────────────────────────

function NoteItem({ note }: { note: { id: string; author: string; date: string; text: string } }) {
  return (
    <div className="bg-[#F8FBFB] border border-[#E3EAEA] rounded-xl p-4">
      <p className="text-sm text-[#1F2A2B] leading-relaxed whitespace-pre-wrap">{note.text}</p>
      <p className="text-xs text-[#5F7C7D] mt-3">{note.author} · {note.date}</p>
    </div>
  )
}
