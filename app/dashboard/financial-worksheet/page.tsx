'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

// ── Product categories (source of truth) ──────────────────────────────────────

const PRODUCT_CATEGORIES = [
  'Domain', 'Email Business', 'Email ISP', 'Email Marketing',
  'Fax Online', 'Logo DIFM', 'Marketing Online', 'Other',
  'Pro Serve', 'SSL', 'Support', 'Website DIFM', 'Website DIY',
] as const

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductRow = {
  id:        string   // stable React key
  category:  string   // product category — drives the Name dropdown
  name:      string   // A col — "Products or Plans" (filtered by category)
  unitPrice: string   // B col — always normalised to "0.00" on blur
  spread:    string   // C col — entered as %, e.g. "25" = 25%; total must = 100%
}

type DbProduct = { product_name: string; product_category: string | null }

type ExchangeRateResult =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok';    rate: number; source: string; fetchedAt: string | null; cacheMonth: string }
  | { status: 'stale'; rate: number; fetchedAt: string; cacheMonth: string }   // API failed, using old cache
  | { status: 'error'; message: string }

const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'MXN'] as const
type Currency = typeof CURRENCIES[number]

// ── Exchange rate localStorage cache ─────────────────────────────────────────

const FX_LS_KEY = 'fw_fx_cache'

type FxCacheEntry = {
  rate:       number
  fetchedAt:  string  // ISO string
  cacheMonth: string  // "YYYY-MM"
}

type FxCache = Partial<Record<string, FxCacheEntry>>

/** Returns the current calendar month as "YYYY-MM". */
function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function loadFxCache(): FxCache {
  try {
    return JSON.parse(localStorage.getItem(FX_LS_KEY) ?? '{}') as FxCache
  } catch {
    return {}
  }
}

function saveFxCache(cache: FxCache) {
  try { localStorage.setItem(FX_LS_KEY, JSON.stringify(cache)) } catch { /* ignore storage quota errors */ }
}

/**
 * Returns the cached entry for `currency` if it is from the current calendar
 * month, otherwise returns null (cache miss / expired).
 */
function getCachedRate(currency: string): FxCacheEntry | null {
  const entry = loadFxCache()[currency]
  if (!entry || entry.cacheMonth !== currentMonth()) return null
  return entry
}

/** Stores a freshly-fetched rate for `currency` in localStorage. */
function setCachedRate(currency: string, rate: number, fetchedAt: string) {
  const cache = loadFxCache()
  cache[currency] = { rate, fetchedAt, cacheMonth: currentMonth() }
  saveFxCache(cache)
}

/**
 * Returns the most recent cached entry for `currency` regardless of month
 * (used as a fallback when the API is unreachable).
 */
function getStaleCachedRate(currency: string): FxCacheEntry | null {
  return loadFxCache()[currency] ?? null
}

/** Removes the localStorage cache entry for `currency`, forcing a fresh fetch. */
function evictCachedRate(currency: string) {
  const cache = loadFxCache()
  delete cache[currency]
  saveFxCache(cache)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the symbol for a given ISO 4217 currency code. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  CAD: '$', USD: '$', MXN: '$',
  EUR: '€', GBP: '£',
}
function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code
}

/** Parse a possibly-formatted string to a number; returns 0 on failure. */
function parseNum(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? 0 : n
}

/** Normalise a unit-price string to exactly 2 decimal places. */
function fmtUnitPrice(s: string): string {
  const n = parseNum(s)
  return n.toFixed(2)
}

/** Normalise a spread% string to exactly 2 decimal places. */
function fmtSpreadPct(s: string): string {
  const n = parseNum(s)
  return n.toFixed(2)
}

/** Normalise a units count: whole number, no decimals. */
function fmtUnits(s: string): string {
  const n = Math.max(0, Math.round(parseNum(s)))
  return String(n)
}

/** Normalise a churn % to exactly 2 decimal places, clamped 0–100. */
function fmtChurn(s: string): string {
  const n = Math.min(100, Math.max(0, parseNum(s)))
  return n.toFixed(2)
}

/** Normalise a contract term: whole number of months, min 1. */
function fmtContractTerm(s: string): string {
  const n = Math.max(1, Math.round(parseNum(s)))
  return String(n)
}

/** Format a number as a local-currency string with 2dp. */
function fmtMoney(n: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style:                 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function fmtRate(r: number): string {
  return r.toFixed(6).replace(/\.?0+$/, '')
}

/** Format "YYYY-MM" as a human-readable month string, e.g. "March 2026". */
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-CA', { month: 'long', year: 'numeric' })
}

/** Round to 2dp to avoid floating-point drift in spread validation. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

let _idCounter = 0
function newId(): string { return String(++_idCounter) }

// ── Defaults ──────────────────────────────────────────────────────────────────
// Start with 4 rows mirroring the template (rows 12-15).
// Row 0 = 100% spread; rows 1-3 = 0% — total is 100%, valid on load.

function makeDefaultProducts(): ProductRow[] {
  return [
    { id: newId(), category: '', name: '', unitPrice: '0.00', spread: '100.00' },
    { id: newId(), category: '', name: '', unitPrice: '0.00', spread: '0.00'   },
    { id: newId(), category: '', name: '', unitPrice: '0.00', spread: '0.00'   },
    { id: newId(), category: '', name: '', unitPrice: '0.00', spread: '0.00'   },
  ]
}

// ── Styles ────────────────────────────────────────────────────────────────────

const INPUT        = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100 text-sm'
const INPUT_RIGHT  = `${INPUT} text-right`
// Extra pr-7 leaves room for the absolutely-positioned '%' suffix (right-3)
const INPUT_SPREAD     = 'w-full bg-white border border-gray-300 rounded-lg pl-3 pr-7 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100 text-sm text-right'
const INPUT_SPREAD_ERR = 'w-full bg-white border border-red-300 rounded-lg pl-3 pr-7 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 text-sm text-right'
// Extra pr-9 leaves room for a two-character suffix like 'mo' (right-3)
const INPUT_SUFFIX2    = 'w-full bg-white border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100 text-sm text-right'
const INPUT_ERR    = 'w-full bg-white border border-red-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 text-sm text-right'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinancialWorksheetPage() {
  const [currency,      setCurrency]      = useState<Currency>('USD')
  const [products,      setProducts]      = useState<ProductRow[]>(makeDefaultProducts)
  const [units,         setUnits]         = useState('0')
  const [churnPct,      setChurnPct]      = useState('0')
  const [contractTerm,  setContractTerm]  = useState('36')

  const [fxResult,    setFxResult]    = useState<ExchangeRateResult>({ status: 'idle' })
  const [dbProducts,  setDbProducts]  = useState<DbProduct[]>([])

  // ── Fetch products from DB once ───────────────────────────────────────────

  useEffect(() => {
    supabase
      .from('products')
      .select('product_name, product_category')
      .order('product_name')
      .then(({ data }) => setDbProducts(data ?? []))
  }, [])

  // ── Spread validation ─────────────────────────────────────────────────────

  const totalSpreadPct = round2(products.reduce((s, p) => s + parseNum(p.spread), 0))
  const spreadValid    = totalSpreadPct === 100

  // ── ARPU calculations (updated formula: unitPrice × spread% / 100) ────────
  // ARPU per row = unitPrice × (spreadPct / 100)  — mirrors D12=B12*C12 intent
  // where C column is now a fractional weight derived from the percentage.

  const arpu = products.map(p => parseNum(p.unitPrice) * (parseNum(p.spread) / 100))

  // Total ARPU = SUM(arpu rows)  — D16 = SUM(D12:D15)
  const totalArpu = round2(arpu.reduce((s, v) => s + v, 0))

  // Assumptions
  const unitsNum        = parseNum(units)
  const churnFrac       = parseNum(churnPct) / 100
  const contractTermNum = Math.max(1, Math.round(parseNum(contractTerm)))

  // MRR = Units × (1 − Churn%) × ARPU
  const mrr = unitsNum * (1 - churnFrac) * totalArpu
  const acv = mrr * 12                 // ACV = MRR × 12
  const tcv = mrr * contractTermNum    // TCV = MRR × Contract Term (months)

  // ── Exchange rate ─────────────────────────────────────────────────────────

  /**
   * Fetch the exchange rate for `cur`, respecting the monthly localStorage cache.
   * Pass `force = true` to bypass the cache (Refresh button).
   */
  const fetchRate = useCallback(async (cur: Currency, force = false) => {
    if (cur === 'CAD') {
      setFxResult({
        status: 'ok',
        rate: 1,
        source: 'CAD is the base currency — no conversion needed',
        fetchedAt: null,
        cacheMonth: currentMonth(),
      })
      return
    }

    // Evict if forcing a refresh
    if (force) evictCachedRate(cur)

    // Check localStorage first — valid for the current calendar month
    const cached = getCachedRate(cur)
    if (cached) {
      setFxResult({
        status: 'ok',
        rate: cached.rate,
        source: 'monthly cache',
        fetchedAt: cached.fetchedAt,
        cacheMonth: cached.cacheMonth,
      })
      return
    }

    setFxResult({ status: 'loading' })

    try {
      const res  = await fetch(`/api/exchange-rate?currency=${cur}`)
      const body = await res.json()

      if (!res.ok) {
        // API error — fall back to stale cache with a warning
        const stale = getStaleCachedRate(cur)
        if (stale) {
          setFxResult({ status: 'stale', rate: stale.rate, fetchedAt: stale.fetchedAt, cacheMonth: stale.cacheMonth })
        } else {
          setFxResult({ status: 'error', message: body.error ?? `HTTP ${res.status}` })
        }
        return
      }

      const fetchedAt = body.fetchedAt ?? new Date().toISOString()
      setCachedRate(cur, body.rate, fetchedAt)
      setFxResult({
        status: 'ok',
        rate: body.rate,
        source: body.source,
        fetchedAt,
        cacheMonth: body.cacheMonth ?? currentMonth(),
      })
    } catch {
      // Network error — fall back to stale cache with a warning
      const stale = getStaleCachedRate(cur)
      if (stale) {
        setFxResult({ status: 'stale', rate: stale.rate, fetchedAt: stale.fetchedAt, cacheMonth: stale.cacheMonth })
      } else {
        setFxResult({ status: 'error', message: 'Network error — could not reach exchange rate service.' })
      }
    }
  }, [])

  useEffect(() => { fetchRate(currency) }, [currency, fetchRate])

  const rate   = (fxResult.status === 'ok' || fxResult.status === 'stale') ? fxResult.rate : null
  const mrrCad = rate != null ? mrr * rate : null
  const acvCad = rate != null ? acv * rate : null
  const tcvCad = rate != null ? tcv * rate : null

  // ── Row management ────────────────────────────────────────────────────────

  function setField(id: string, field: keyof ProductRow, value: string) {
    setProducts(prev => prev.map(p => {
      if (p.id !== id) return p
      if (field === 'category') {
        // Clear name if it no longer belongs to the new category
        const validNames = new Set(
          dbProducts.filter(dp => dp.product_category === value).map(dp => dp.product_name)
        )
        return { ...p, category: value, name: validNames.has(p.name) ? p.name : '' }
      }
      return { ...p, [field]: value }
    }))
  }

  function blurUnitPrice(id: string, raw: string) {
    setField(id, 'unitPrice', fmtUnitPrice(raw))
  }

  function blurSpread(id: string, raw: string) {
    setField(id, 'spread', fmtSpreadPct(raw))
  }

  function addRow() {
    setProducts(prev => [...prev, { id: newId(), category: '', name: '', unitPrice: '0.00', spread: '0.00' }])
  }

  function removeRow(id: string) {
    if (products.length <= 1) return           // always keep at least one row
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const rateLoading = fxResult.status === 'loading'

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Financial Worksheet</h1>
          <p className="text-sm text-gray-500 mt-1">Organic Recurring Revenue Model</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-medium text-gray-700">Billing Currency</span>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value as Currency)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Deal type banner */}
      <div className="bg-brand-50 border border-brand-100 rounded-xl px-5 py-3">
        <p className="text-sm font-semibold text-brand-700 uppercase tracking-wide">Type of Deal: Organic Recurring</p>
        <p className="text-xs text-brand-500 mt-0.5">Adjust fields in the products table and assumptions based on your deal.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── LEFT: Products table ── */}
        <div className="space-y-3">
          <div className={`bg-white border rounded-xl shadow-sm overflow-hidden ${spreadValid ? 'border-gray-200' : 'border-red-200'}`}>

            {/* Table header row */}
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Products or Plans</h2>
              <button
                onClick={addRow}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors"
              >
                <span className="text-base leading-none">+</span> Add Row
              </button>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-2.5 text-left  text-xs font-medium text-gray-500">Category</th>
                  <th className="px-4 py-2.5 text-left  text-xs font-medium text-gray-500">Name</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Unit Price</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Spread %</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">ARPU</th>
                  <th className="px-2 py-2.5 w-8"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {products.map((p, i) => {
                  const arpuVal     = arpu[i]
                  const spreadNum   = parseNum(p.spread)
                  const spreadError = spreadNum < 0 || spreadNum > 100

                  const categoryProducts = dbProducts.filter(dp => dp.product_category === p.category)
                  const nameDisabled = !p.category

                  return (
                    <tr key={p.id} className="hover:bg-gray-50 group">

                      {/* Category */}
                      <td className="px-3 py-2">
                        <select
                          value={p.category}
                          onChange={e => setField(p.id, 'category', e.target.value)}
                          className={INPUT}
                        >
                          <option value="">— Category —</option>
                          {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>

                      {/* Name — dependent on category */}
                      <td className="px-3 py-2">
                        <select
                          value={p.name}
                          onChange={e => setField(p.id, 'name', e.target.value)}
                          disabled={nameDisabled}
                          title={nameDisabled ? 'Select a category first' : undefined}
                          className={`${INPUT} disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`}
                        >
                          {nameDisabled ? (
                            <option value="">Select category first</option>
                          ) : categoryProducts.length === 0 ? (
                            <option value="">No products in this category</option>
                          ) : (
                            <>
                              <option value="">— Select product —</option>
                              {categoryProducts.map(dp => (
                                <option key={dp.product_name} value={dp.product_name}>{dp.product_name}</option>
                              ))}
                            </>
                          )}
                        </select>
                      </td>

                      {/* Unit Price — 2dp enforced on blur */}
                      <td className="px-3 py-2">
                        <div className="relative">
                          <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm pointer-events-none select-none">{getCurrencySymbol(currency)}</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={p.unitPrice}
                            onChange={e => setField(p.id, 'unitPrice', e.target.value.replace(/[^0-9.]/g, ''))}
                            onBlur={e  => blurUnitPrice(p.id, e.target.value)}
                            onFocus={e => e.target.select()}
                            className={`${INPUT_RIGHT} pl-6`}
                          />
                        </div>
                      </td>

                      {/* Spread % — numeric entry, e.g. "25" = 25% */}
                      <td className="px-3 py-2">
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={p.spread}
                            onChange={e => setField(p.id, 'spread', e.target.value.replace(/[^0-9.]/g, ''))}
                            onBlur={e  => blurSpread(p.id, e.target.value)}
                            onFocus={e => e.target.select()}
                            className={spreadError ? INPUT_SPREAD_ERR : INPUT_SPREAD}
                            placeholder="0.00"
                          />
                          <span className="absolute inset-y-0 right-3 flex items-center text-gray-400 text-xs pointer-events-none select-none">%</span>
                        </div>
                      </td>

                      {/* ARPU (computed) */}
                      <td className="px-4 py-2 text-right font-medium tabular-nums text-gray-700">
                        {arpuVal > 0
                          ? fmtMoney(arpuVal, currency)
                          : <span className="text-gray-300">—</span>}
                      </td>

                      {/* Remove button */}
                      <td className="px-2 py-2">
                        {products.length > 1 && (
                          <button
                            onClick={() => removeRow(p.id)}
                            title="Remove row"
                            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all text-base leading-none"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Summary footer — mirrors template row 16 */}
              <tfoot>
                <tr className={`border-t-2 ${spreadValid ? 'border-gray-200 bg-gray-50' : 'border-red-200 bg-red-50'}`}>
                  <td className="px-4 py-2.5"></td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">ARPU</td>
                  <td className="px-4 py-2.5"></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className={`text-xs font-semibold ${spreadValid ? 'text-gray-600' : 'text-red-600'}`}>
                      {totalSpreadPct.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-gray-900">
                    {totalArpu > 0
                      ? fmtMoney(totalArpu, currency)
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Spread validation banner */}
          {!spreadValid && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm font-medium text-red-700">
                Spread total is {totalSpreadPct.toFixed(2)}% — all lines must add up to exactly 100%.
              </p>
              <p className="text-xs text-red-500 mt-0.5">
                {totalSpreadPct < 100
                  ? `Add ${(100 - totalSpreadPct).toFixed(2)}% more across your product rows.`
                  : `Reduce by ${(totalSpreadPct - 100).toFixed(2)}% across your product rows.`}
              </p>
            </div>
          )}

          {spreadValid && totalArpu > 0 && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              <p className="text-xs text-green-700 font-medium">Spread total is 100% — allocation is valid.</p>
            </div>
          )}
        </div>

        {/* ── RIGHT: Assumptions + Forecast ── */}
        <div className="space-y-4">

          {/* Assumptions */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assumptions</h2>
              <p className="text-xs text-gray-400 mt-0.5">Adjust fields based on your deal assumptions</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Units</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={units}
                    onChange={e => setUnits(e.target.value.replace(/[^0-9]/g, ''))}
                    onBlur={e  => setUnits(fmtUnits(e.target.value))}
                    onFocus={e => e.target.select()}
                    className={INPUT_RIGHT}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Estimated Churn Out</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={churnPct}
                      onChange={e => setChurnPct(e.target.value.replace(/[^0-9.]/g, ''))}
                      onBlur={e  => setChurnPct(fmtChurn(e.target.value))}
                      onFocus={e => e.target.select()}
                      className={INPUT_SPREAD}
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center text-gray-400 text-sm pointer-events-none select-none">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Contract Term</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={contractTerm}
                      onChange={e => setContractTerm(e.target.value.replace(/[^0-9]/g, ''))}
                      onBlur={e  => setContractTerm(fmtContractTerm(e.target.value))}
                      onFocus={e => e.target.select()}
                      className={INPUT_SUFFIX2}
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center text-gray-400 text-sm pointer-events-none select-none">mo</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <span className="text-sm text-gray-600">Average Revenue per Unit</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">
                  {totalArpu > 0
                    ? fmtMoney(totalArpu, currency)
                    : <span className="text-gray-400">—</span>}
                </span>
              </div>
            </div>
          </div>

          {/* Revenue Forecast */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue Forecast</h2>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-gray-700">{currency}</span>
                <span className="text-gray-300">→</span>
                <span className="font-medium text-green-700">CAD</span>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {[
                { label: 'Monthly Recurring Rev (MRR)', billing: mrr, cad: mrrCad },
                { label: 'Annual Contract Value (ACV)', billing: acv, cad: acvCad },
                { label: 'Total Contract Value (TCV)',  billing: tcv, cad: tcvCad },
              ].map(({ label, billing, cad }) => (
                <div key={label} className="px-5 py-3 flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-700 min-w-0">{label}</span>
                  <div className="flex items-center gap-6 shrink-0 tabular-nums">
                    <span className="text-sm text-gray-900 font-medium w-28 text-right">
                      {billing > 0 ? fmtMoney(billing, currency) : <span className="text-gray-300">—</span>}
                    </span>
                    <span className={`text-sm font-semibold w-28 text-right ${cad != null && cad > 0 ? 'text-green-700' : 'text-gray-300'}`}>
                      {rateLoading
                        ? <span className="text-gray-400 text-xs">Loading…</span>
                        : cad != null && cad > 0
                          ? fmtMoney(cad, 'CAD')
                          : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <ExchangeRateCard
            currency={currency}
            result={fxResult}
            onRefresh={() => fetchRate(currency, true)}
          />
        </div>
      </div>
    </div>
  )
}

// ── Exchange Rate Card ────────────────────────────────────────────────────────

function ExchangeRateCard({ currency, result, onRefresh }: {
  currency:  string
  result:    ExchangeRateResult
  onRefresh: () => void
}) {
  if (currency === 'CAD') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <p className="text-sm text-green-700 font-medium">No conversion needed — billing currency is already CAD.</p>
        </div>
      </div>
    )
  }

  if (result.status === 'idle' || result.status === 'loading') {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-3">
        <p className="text-sm text-gray-400">Fetching exchange rate…</p>
      </div>
    )
  }

  if (result.status === 'error') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <p className="text-sm text-red-700 font-medium">Exchange rate unavailable</p>
        </div>
        <p className="text-xs text-red-600">{result.message}</p>
        <p className="text-xs text-red-500">CAD conversions cannot be calculated. Check your connection or API key.</p>
        <button onClick={onRefresh} className="text-xs text-red-600 hover:text-red-800 font-medium underline">Retry</button>
      </div>
    )
  }

  // Stale fallback: API failed but we have an old cached value
  if (result.status === 'stale') {
    const { rate, fetchedAt, cacheMonth } = result
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <p className="text-sm font-medium text-amber-800">Exchange Rate (stale)</p>
          </div>
          <button onClick={onRefresh} className="text-xs text-amber-600 hover:text-amber-800 transition-colors" title="Retry fetch">
            ↻ Retry
          </button>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold text-gray-900 tabular-nums">{fmtRate(rate)}</span>
          <span className="text-sm text-gray-500">
            {currency} → CAD <span className="text-xs">(1 {currency} = {fmtRate(rate)} CAD)</span>
          </span>
        </div>
        <div className="text-xs text-amber-700 space-y-0.5">
          <p>Could not fetch current rate — using last known value from {fmtMonth(cacheMonth)}.</p>
          {fetchedAt && <p>Originally fetched: {new Date(fetchedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
        </div>
      </div>
    )
  }

  // Normal ok state
  const { rate, source, fetchedAt, cacheMonth } = result
  const fromCache = source === 'monthly cache'
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <p className="text-sm font-medium text-gray-700">Exchange Rate</p>
        </div>
        <button onClick={onRefresh} className="text-xs text-gray-400 hover:text-brand-600 transition-colors" title="Refresh rate">
          ↻ Refresh
        </button>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold text-gray-900 tabular-nums">{fmtRate(rate)}</span>
        <span className="text-sm text-gray-500">
          {currency} → CAD <span className="text-xs">(1 {currency} = {fmtRate(rate)} CAD)</span>
        </span>
      </div>
      <div className="text-xs text-gray-400 space-y-0.5">
        {fromCache
          ? <p>Exchange rates last updated: {fmtMonth(cacheMonth)} (cached — refreshes next month)</p>
          : <p>Source: {source}</p>
        }
        {fetchedAt && !fromCache && (
          <p>Rate as of: {new Date(fetchedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        )}
        {fetchedAt && fromCache && (
          <p>Fetched: {new Date(fetchedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        )}
      </div>
    </div>
  )
}
