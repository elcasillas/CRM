import Link from 'next/link'
import type { DealWithRelations } from '@/lib/types'
import { DealStageBadge } from '@/components/dashboard/deal-stage-badge'

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${v.toFixed(0)}`
}

function relative(ts: string | null): string {
  if (!ts) return '—'
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30)  return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}

export function RecentActivity({ deals }: { deals: DealWithRelations[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Recent Deal Activity</h2>
        <Link href="/dashboard/deals" className="text-xs text-[#00ADB1] hover:text-[#00989C]">View all →</Link>
      </div>

      {deals.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-400">No deals yet.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {deals.map(deal => (
            <div key={deal.id} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{deal.deal_name}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {deal.accounts?.account_name ?? '—'}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400">{relative(deal.last_activity_at)}</p>
                  {deal.value_amount != null && (
                    <p className="text-xs font-medium text-gray-700 mt-0.5">{fmt(deal.value_amount)}</p>
                  )}
                </div>
              </div>
              {deal.deal_stages?.stage_name && (
                <div className="mt-1.5">
                  <DealStageBadge stageName={deal.deal_stages.stage_name} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
