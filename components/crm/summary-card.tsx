interface SummaryCardProps {
  label:  string
  value:  string | number
  sub?:   string
  href?:  string
}

export function SummaryCard({ label, value, sub }: SummaryCardProps) {
  return (
    <div className="bg-white border border-[#E3EAEA] rounded-xl shadow-sm p-5">
      <p className="text-xs font-medium text-[#5F7C7D] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#1F2A2B]">{value}</p>
      {sub && <p className="text-xs text-[#5F7C7D] mt-1">{sub}</p>}
    </div>
  )
}
