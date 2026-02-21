import Link from 'next/link'

interface StatCardProps {
  label: string
  value: string | number
  sub?:  string
  href?: string
}

export function StatCard({ label, value, sub, href }: StatCardProps) {
  const body = (
    <>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-3xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
    </>
  )
  return href ? (
    <Link href={href} className="group bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:border-blue-300 transition-colors block">
      {body}
    </Link>
  ) : (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">{body}</div>
  )
}
