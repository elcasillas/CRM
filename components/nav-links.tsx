'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = { href: string; label: string; exact?: boolean }

const BASE_ITEMS: NavItem[] = [
  { href: '/dashboard',          label: 'Overview', exact: true },
  { href: '/dashboard/accounts', label: 'Accounts' },
  { href: '/dashboard/deals',    label: 'Deals' },
]

const ADMIN_ITEMS: NavItem[] = [
  { href: '/dashboard/admin/stages', label: 'Stages' },
  { href: '/dashboard/admin/users',  label: 'Users' },
]

const ACTIVE  = 'text-sm text-gray-900 bg-gray-100 font-medium px-3 py-1.5 rounded-lg'
const INACTIVE = 'text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors'

export function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()

  function isActive({ href, exact }: NavItem) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  return (
    <nav className="flex items-center gap-1">
      {BASE_ITEMS.map(item => (
        <Link key={item.href} href={item.href} className={isActive(item) ? ACTIVE : INACTIVE}>
          {item.label}
        </Link>
      ))}
      {isAdmin && (
        <>
          <span className="text-gray-300 mx-1 select-none">|</span>
          {ADMIN_ITEMS.map(item => (
            <Link key={item.href} href={item.href} className={isActive(item) ? ACTIVE : INACTIVE}>
              {item.label}
            </Link>
          ))}
        </>
      )}
    </nav>
  )
}
