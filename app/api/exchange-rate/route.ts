import { NextRequest, NextResponse } from 'next/server'

// Exchange rate API — proxied server-side so the key never reaches the browser.
// Provider: exchangerate.host /live endpoint, USD-based quotes.
// To convert X [currency] → CAD:
//   currency === 'CAD'  → multiply by 1
//   currency === 'USD'  → multiply by quotes.USDCAD
//   other               → multiply by (quotes.USDCAD / quotes[`USD${currency}`])

const API_KEY = process.env.EXCHANGERATE_API_KEY ?? '5e3b2faafec2ad11bbada5d84fd447b2'
const BASE_URL = 'http://api.exchangerate.host/live'

// Simple in-process cache: refresh at most once per hour
let cache: { quotes: Record<string, number>; fetchedAt: number } | null = null
const CACHE_TTL_MS = 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const currency = (request.nextUrl.searchParams.get('currency') ?? 'USD').toUpperCase()

  if (currency === 'CAD') {
    return NextResponse.json({ rate: 1, source: 'CAD is the base currency — no conversion needed', fetchedAt: null })
  }

  // Return cached result if fresh
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    const rate = resolveRate(cache.quotes, currency)
    if (rate === null) return NextResponse.json({ error: `Unsupported currency: ${currency}` }, { status: 400 })
    return NextResponse.json({ rate, source: 'exchangerate.host (cached)', fetchedAt: new Date(cache.fetchedAt).toISOString() })
  }

  // Fetch fresh rates
  try {
    const res = await fetch(`${BASE_URL}?access_key=${API_KEY}`, { next: { revalidate: 0 } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    if (!body.success || !body.quotes) throw new Error(body.error?.info ?? 'Invalid response from exchangerate.host')

    cache = { quotes: body.quotes as Record<string, number>, fetchedAt: Date.now() }

    const rate = resolveRate(cache.quotes, currency)
    if (rate === null) return NextResponse.json({ error: `Unsupported currency: ${currency}` }, { status: 400 })

    return NextResponse.json({ rate, source: 'exchangerate.host', fetchedAt: new Date(cache.fetchedAt).toISOString() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Exchange rate fetch failed: ${msg}` }, { status: 502 })
  }
}

/**
 * Given USD-based quotes, return the rate to multiply by to convert
 * 1 unit of `currency` into CAD.
 * Returns null if the currency is unknown.
 */
function resolveRate(quotes: Record<string, number>, currency: string): number | null {
  const usdCad = quotes['USDCAD']
  if (!usdCad) return null

  if (currency === 'USD') return usdCad

  const usdX = quotes[`USD${currency}`]
  if (!usdX) return null

  // 1 [currency] = (1/usdX) USD = (1/usdX) * usdCad CAD
  return usdCad / usdX
}
