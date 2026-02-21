import Link from 'next/link'

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${v.toFixed(0)}`
}

export interface DealStageRow {
  id:         string
  stage_name: string
  is_won:     boolean
  is_lost:    boolean
  count:      number
  value:      number
}

export function DealsByStage({ rows }: { rows: DealStageRow[] }) {
  const maxCount = Math.max(...rows.map(r => r.count), 1)
  const hasAny   = rows.some(r => r.count > 0)

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Deals by Stage</h2>
        <Link href="/dashboard/deals" className="text-xs text-blue-600 hover:text-blue-700">View all →</Link>
      </div>

      {!hasAny ? (
        <p className="px-5 py-6 text-sm text-gray-400">No deals yet.</p>
      ) : (
        <>
          <div className="px-5 py-2 flex items-center gap-4 bg-gray-50 border-b border-gray-100">
            <span className="flex-1 text-xs text-gray-400">Stage</span>
            <span className="w-32 flex-shrink-0 text-xs text-gray-400">Volume</span>
            <span className="w-20 text-right flex-shrink-0 text-xs text-gray-400">Value</span>
            <span className="w-8 text-right flex-shrink-0 text-xs text-gray-400">#</span>
          </div>
          <div className="divide-y divide-gray-50">
            {rows.map(row => {
              const barClass = row.is_lost ? 'bg-red-300' : row.is_won ? 'bg-green-500' : 'bg-blue-500'
              return (
                <div key={row.id} className="px-5 py-2.5 flex items-center gap-4">
                  <p className="flex-1 text-sm text-gray-700 truncate">{row.stage_name}</p>
                  <div className="w-32 flex-shrink-0">
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barClass}`}
                        style={{ width: row.count > 0 ? `${(row.count / maxCount) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                  <p className="w-20 text-right flex-shrink-0 text-sm font-medium text-gray-900">
                    {row.value > 0 ? fmt(row.value) : '—'}
                  </p>
                  <p className={`w-8 text-right flex-shrink-0 text-sm font-medium ${row.count > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                    {row.count}
                  </p>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
