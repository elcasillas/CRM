'use client'

import { useEffect, useState } from 'react'
import { getCachedRate, setCachedRate } from '@/lib/cad-convert'

type CadRateState =
  | { status: 'loading' }
  | { status: 'ok';    rate: number }
  | { status: 'error' }

/**
 * Returns the exchange rate to multiply by to convert 1 unit of `currency`
 * into CAD. Rates are fetched from /api/exchange-rate and cached in
 * localStorage for the current calendar month.
 *
 * - If currency is 'CAD', immediately returns rate = 1.
 * - If the fetch fails and no cache is available, returns status = 'error'.
 */
export function useCadRate(currency: string): CadRateState {
  const [state, setState] = useState<CadRateState>(() => {
    if (currency === 'CAD') return { status: 'ok', rate: 1 }
    const cached = getCachedRate(currency)
    if (cached) return { status: 'ok', rate: cached.rate }
    return { status: 'loading' }
  })

  useEffect(() => {
    if (currency === 'CAD') {
      setState({ status: 'ok', rate: 1 })
      return
    }

    // Fresh cache hit — skip fetch
    const cached = getCachedRate(currency)
    if (cached) {
      setState({ status: 'ok', rate: cached.rate })
      return
    }

    let cancelled = false
    fetch(`/api/exchange-rate?currency=${encodeURIComponent(currency)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((json: { rate?: number; fetchedAt?: string | null }) => {
        if (cancelled) return
        if (typeof json.rate !== 'number') throw new Error('Invalid response')
        setCachedRate(currency, json.rate, json.fetchedAt ?? new Date().toISOString())
        setState({ status: 'ok', rate: json.rate })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })

    return () => { cancelled = true }
  }, [currency])

  return state
}
