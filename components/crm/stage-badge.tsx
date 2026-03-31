const STAGE_STYLES: Record<string, string> = {
  'Solution Qualified':   'bg-blue-50   text-blue-700   ring-blue-200',
  'Presenting to EDM':    'bg-indigo-50 text-indigo-700 ring-indigo-200',
  'Short Listed':         'bg-violet-50 text-violet-700 ring-violet-200',
  'Contract Negotiation': 'bg-amber-50  text-amber-700  ring-amber-200',
  'Contract Negotiations':'bg-amber-50  text-amber-700  ring-amber-200',
  'Contract Signed':      'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'Implementing':         'bg-teal-50   text-teal-700   ring-teal-200',
  'Closed Won':           'bg-green-50  text-green-700  ring-green-200',
  'Closed Lost':          'bg-red-50    text-red-600    ring-red-200',
}

export function StageBadge({ stage }: { stage: string }) {
  const cls = STAGE_STYLES[stage] ?? 'bg-gray-50 text-gray-600 ring-gray-200'
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md ring-1 ${cls}`}>
      {stage}
    </span>
  )
}
