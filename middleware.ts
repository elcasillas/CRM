import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * How long to wait for Supabase Auth before giving up on the session check.
 *
 * Measured against the live project: about 1s warm, up to 5.5s just after the
 * Auth service cold starts. 8s therefore clears real latency without failing
 * open needlessly, and stays well inside the platform's invocation limit so
 * the request is never killed mid-flight.
 *
 * Failing open is safe here because middleware is not the only gate:
 * app/dashboard/layout.tsx calls getUser() itself and redirects to /login,
 * and app/dashboard/admin/layout.tsx additionally checks the role.
 */
const AUTH_TIMEOUT_MS = 8000

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — must not be removed or moved.
  //
  // Time-boxed. This is a network call to Supabase Auth, and the matcher below
  // covers every page, so an unresponsive Auth service would otherwise hang
  // every request until the platform kills it: a site wide 504 that takes out
  // /login too, leaving no way back in. On timeout the session is treated as
  // indeterminate rather than absent, and the request is allowed through for
  // pages to handle, which keeps the app responding.
  let user: unknown = null
  let authTimedOut = false
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), AUTH_TIMEOUT_MS)),
    ])
    if (result === 'timeout') authTimedOut = true
    else user = result.data.user
  } catch {
    // Network or Auth failure reads the same as a timeout: do not guess
    authTimedOut = true
  }

  const { pathname } = request.nextUrl

  // With the session unknown, redirecting either way would be a guess. Let the
  // request through and let the page decide.
  if (authTimedOut) return supabaseResponse

  // Redirect unauthenticated users away from protected routes.
  if (pathname.startsWith('/dashboard') && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect authenticated users away from the login page.
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
