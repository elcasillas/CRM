export interface ContractRow {
  id:           string
  account_name: string | null
  renewal_date: string
  days:         number
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function daysLabel(n: number): string {
  if (n <= 0)  return 'Today'
  if (n === 1) return '1d'
  return `${n}d`
}

function urgencyText(days: number): string {
  if (days <= 30) return 'text-red-600'
  if (days <= 60) return 'text-amber-600'
  return 'text-blue-600'
}

function urgencyBorder(days: number): string {
  if (days <= 30) return 'border-l-red-400'
  if (days <= 60) return 'border-l-amber-400'
  return 'border-l-blue-400'
}

export function ContractsRenewing({ rows }: { rows: ContractRow[] }) {
  const in30 = rows.filter(r => r.days <= 30).length
  const in60 = rows.filter(r => r.days > 30 && r.days <= 60).length
  const in90 = rows.filter(r => r.days > 60).length

  const buckets = [
    { label: `${in30} ≤30d`, active: in30 > 0, cls: 'bg-red-50 text-red-600'    },
    { label: `${in60} ≤60d`, active: in60 > 0, cls: 'bg-amber-50 text-amber-600' },
    { label: `${in90} ≤90d`, active: in90 > 0, cls: 'bg-blue-50 text-blue-600'   },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Contracts Renewing Soon</h2>
        <div className="flex items-center gap-2 mt-2.5">
          {buckets.map(b => (
            <span
              key={b.label}
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${b.active ? b.cls : 'bg-gray-50 text-gray-400'}`}
            >
              {b.label}
            </span>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-400">No active contracts renewing in the next 90 days.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map(row => (
            <div
              key={row.id}
              className={`px-5 py-3 flex items-center justify-between gap-3 border-l-2 ${urgencyBorder(row.days)}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{row.account_name ?? '—'}</p>
                <p className="text-xs text-gray-400 mt-0.5">{fmtDate(row.renewal_date)}</p>
              </div>
              <span className={`flex-shrink-0 text-sm font-semibold ${urgencyText(row.days)}`}>
                {daysLabel(row.days)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
