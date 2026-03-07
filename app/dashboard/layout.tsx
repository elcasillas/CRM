import Image from 'next/image'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from '@/components/sign-out-button'
import { GlobalSearch } from '@/components/global-search'
import { NavLinks } from '@/components/nav-links'

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
  const isAdmin = (profile as { role: string } | null)?.role === 'admin'

  return (
    <div>
      <header className="sticky top-0 z-50 bg-brand-900 border-b border-brand-800">
        <div className="max-w-7xl mx-auto px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Image
              src="/hostopia-logo.png"
              alt="Hostopia"
              width={120}
              height={33}
              className="shrink-0"
              priority
            />
            <NavLinks isAdmin={isAdmin} />
          </div>
          <div className="flex items-center gap-4">
            <GlobalSearch />
            <span className="text-sm text-brand-300 hidden sm:block">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="bg-slate-50 min-h-screen">{children}</main>
    </div>
  )
}
