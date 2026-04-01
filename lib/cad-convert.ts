/**
 * Shared CAD conversion utilities.
 *
 * Exchange rates are fetched from /api/exchange-rate (server-side proxy to
 * exchangerate.host) and cached in localStorage keyed by currency, invalidated
 * monthly.
 */

const FX_LS_KEY = 'crm_fx_cache'

type FxCacheEntry = { rate: number; fetchedAt: string; cacheMonth: string }
type FxCache = Partial<Record<string, FxCacheEntry>>

export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function loadFxCache(): FxCache {
  try { return JSON.parse(localStorage.getItem(FX_LS_KEY) ?? '{}') as FxCache } catch { return {} }
}
function saveFxCache(cache: FxCache) {
  try { localStorage.setItem(FX_LS_KEY, JSON.stringify(cache)) } catch { /* quota */ }
}

export function getCachedRate(currency: string): FxCacheEntry | null {
  const e = loadFxCache()[currency]
  return (e && e.cacheMonth === currentMonth()) ? e : null
}
export function setCachedRate(currency: string, rate: number, fetchedAt: string) {
  const c = loadFxCache()
  c[currency] = { rate, fetchedAt, cacheMonth: currentMonth() }
  saveFxCache(c)
}

/**
 * Convert `amount` in `currency` to CAD using the given exchange rate.
 * - If currency is 'CAD', returns amount unchanged (rate ignored).
 * - Returns null if amount is null/zero or rate is not available.
 */
export function convertToCAD(
  amount: number | null | undefined,
  currency: string,
  rate: number | null,
): number | null {
  if (amount == null || amount === 0) return null
  if (currency === 'CAD') return Math.round(amount * 100) / 100
  if (rate == null) return null
  return Math.round(amount * rate * 100) / 100
}

/** Format a CAD amount for inline display: "$1,350 CAD" */
export function fmtCAD(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount) + ' CAD'
}
