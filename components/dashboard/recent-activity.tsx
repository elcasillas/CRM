import Link from 'next/link'
import type { DealWithRelations } from '@/lib/types'

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

function stageBadge(s: DealWithRelations['deal_stages']): string {
  if (!s) return 'bg-gray-100 text-gray-600'
  if (s.is_lost) return 'bg-red-50 text-red-600'
  if (s.is_won)  return 'bg-green-50 text-green-700'
  if (s.sort_order <= 3) return 'bg-gray-100 text-gray-700'
  if (s.sort_order <= 5) return 'bg-amber-50 text-amber-700'
  return 'bg-orange-50 text-orange-700'
}

export function RecentActivity({ deals }: { deals: DealWithRelations[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Recent Deal Activity</h2>
        <Link href="/dashboard/deals" className="text-xs text-blue-600 hover:text-blue-700">View all →</Link>
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
              {deal.deal_stages && (
                <span className={`inline-flex mt-1.5 text-xs font-medium px-1.5 py-0.5 rounded ${stageBadge(deal.deal_stages)}`}>
                  {deal.deal_stages.stage_name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
