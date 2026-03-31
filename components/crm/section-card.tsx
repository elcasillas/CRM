interface SectionCardProps {
  title:    string
  action?:  React.ReactNode
  children: React.ReactNode
  noPadding?: boolean
}

export function SectionCard({ title, action, children, noPadding = false }: SectionCardProps) {
  return (
    <div className="bg-white border border-[#E3EAEA] rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 bg-[#00ADB1] rounded-t-xl">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {action}
      </div>
      <div className={noPadding ? '' : 'px-6 py-5'}>
        {children}
      </div>
    </div>
  )
}
