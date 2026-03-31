'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard',                      label: 'Overview'       },
  { href: '/dashboard/accounts',             label: 'Accounts'       },
  { href: '/dashboard/deals',                label: 'Deals'          },
  { href: '/dashboard/deals/all',            label: 'All Deals'      },
  { href: '/dashboard/products',             label: 'Products'       },
  { href: '/dashboard/partners',             label: 'AHI'            },
  { href: '/dashboard/financial-worksheet',  label: 'Worksheet'      },
]

const ADMIN_ITEMS = [
  { href: '/dashboard/admin/users',          label: 'Users'          },
  { href: '/dashboard/admin/health-scoring', label: 'Settings'       },
]

export function CrmSidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname()

  function Item({ href, label }: { href: string; label: string }) {
    const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
    return (
      <Link
        href={href}
        className={`block text-sm px-3 py-2 rounded-lg transition-colors ${
          active
            ? 'bg-[#00ADB1]/10 text-[#00ADB1] font-medium'
            : 'text-[#5F7C7D] hover:text-[#1F2A2B] hover:bg-gray-50'
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-white border-r border-[#E3EAEA] min-h-screen">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-[#E3EAEA]">
        <p className="text-sm font-bold text-[#1F2A2B] leading-tight">Hostopia</p>
        <p className="text-xs text-[#5F7C7D]">CRM</p>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(item => <Item key={item.href} {...item} />)}

        {isAdmin && (
          <>
            <p className="px-3 pt-4 pb-1 text-xs font-semibold text-[#5F7C7D] uppercase tracking-wider">Admin</p>
            {ADMIN_ITEMS.map(item => <Item key={item.href} {...item} />)}
          </>
        )}
      </nav>

      {/* Design sample link at bottom */}
      <div className="px-3 py-3 border-t border-[#E3EAEA]">
        <Item href="/crm" label="Design Sample" />
      </div>
    </aside>
  )
}
