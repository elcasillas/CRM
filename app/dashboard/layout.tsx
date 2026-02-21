import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from '@/components/sign-out-button'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const isAdmin = profile?.role === 'admin'

  return (
    <div>
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-gray-900">CRM</span>
            <nav className="flex items-center gap-1">
              <Link
                href="/dashboard/accounts"
                className="text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                Accounts
              </Link>
              <Link
                href="/dashboard/deals"
                className="text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                Deals
              </Link>
              {isAdmin && (
                <>
                  <span className="text-gray-300 mx-1 select-none">|</span>
                  <Link
                    href="/dashboard/admin/stages"
                    className="text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Stages
                  </Link>
                  <Link
                    href="/dashboard/admin/users"
                    className="text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Users
                  </Link>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
