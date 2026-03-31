export function CrmTopbar({ title = 'Hostopia | CRM', userName = 'EC' }: { title?: string; userName?: string }) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[#E3EAEA] shadow-sm">
      <div className="flex items-center justify-between px-6 h-14">
        <h1 className="text-sm font-semibold text-[#1F2A2B]">{title}</h1>

        <div className="flex items-center gap-3">
          {/* Search placeholder */}
          <div className="hidden sm:flex items-center gap-2 bg-[#F8FBFB] border border-[#E3EAEA] rounded-lg px-3 py-2 w-60">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[#5F7C7D] shrink-0">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-[#5F7C7D]">Search…</span>
          </div>

          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-[#00ADB1] flex items-center justify-center text-white text-xs font-semibold shrink-0">
            {userName.slice(0, 2).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  )
}
