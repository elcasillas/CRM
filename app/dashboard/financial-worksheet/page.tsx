'use client'

import { useCallback, useEffect, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductRow = {
  name:       string  // A col — "Products or Plans"
  unitPrice:  string  // B col — "Unit Price" (user input, string for editing)
  spread:     string  // C col — "Spread" (user input)
}

type ExchangeRateResult =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok';    rate: number; source: string; fetchedAt: string | null }
  | { status: 'error'; message: string }

// Currencies supported by the workbook (Values sheet) + common additions
const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'MXN'] as const
type Currency = typeof CURRENCIES[number]

// ── Formatting helpers ────────────────────────────────────────────────────────

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

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? 0 : n
}

// ── Default products (from template row 12-15) ────────────────────────────────

const DEFAULT_PRODUCTS: ProductRow[] = [
  { name: '', unitPrice: '0', spread: '1' },
  { name: '', unitPrice: '0', spread: '0' },
  { name: '', unitPrice: '0', spread: '0' },
  { name: '', unitPrice: '0', spread: '0' },
]

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100 text-sm'
const INPUT_RIGHT = `${INPUT} text-right`

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinancialWorksheetPage() {
  // Config
  const [currency,   setCurrency]   = useState<Currency>('USD')
  const [products,   setProducts]   = useState<ProductRow[]>(DEFAULT_PRODUCTS)
  const [units,      setUnits]      = useState('0')
  const [churnPct,   setChurnPct]   = useState('0')   // e.g. "5" = 5%

  // Exchange rate state
  const [fxResult, setFxResult] = useState<ExchangeRateResult>({ status: 'idle' })

  // ── Derived calculations (mirror template formulas) ───────────────────────

  // ARPU per row = unitPrice × spread (D12=B12*C12)
  const arpu = products.map(p => parseNum(p.unitPrice) * parseNum(p.spread))

  // Total ARPU = SUM(ARPU rows)      — D16 = SUM(D12:D15)
  const totalArpu = arpu.reduce((s, v) => s + v, 0)

  // Total Spread = SUM(spread rows)  — C16 = SUM(C12:C15)
  const totalSpread = products.reduce((s, p) => s + parseNum(p.spread), 0)

  // Assumptions
  const unitsNum   = parseNum(units)
  const churnFrac  = parseNum(churnPct) / 100          // G11 in template is a fraction

  // MRR = Units × (1 − Churn%) × ARPU  — G16 = G10*(1-G11)*G9
  const mrr = unitsNum * (1 - churnFrac) * totalArpu

  // ACV = MRR × 12  — G14 = G16*12
  const acv = mrr * 12

  // TCV = MRR × 36  — G15 = G16*36
  const tcv = mrr * 36

  // ── Exchange rate fetch ───────────────────────────────────────────────────

  const fetchRate = useCallback(async (cur: Currency) => {
    if (cur === 'CAD') {
      setFxResult({ status: 'ok', rate: 1, source: 'CAD is the base currency — no conversion needed', fetchedAt: null })
      return
    }
    setFxResult({ status: 'loading' })
    try {
      const res  = await fetch(`/api/exchange-rate?currency=${cur}`)
      const body = await res.json()
      if (!res.ok) {
        setFxResult({ status: 'error', message: body.error ?? `HTTP ${res.status}` })
      } else {
        setFxResult({ status: 'ok', rate: body.rate, source: body.source, fetchedAt: body.fetchedAt })
      }
    } catch {
      setFxResult({ status: 'error', message: 'Network error — could not reach exchange rate service.' })
    }
  }, [])

  useEffect(() => { fetchRate(currency) }, [currency, fetchRate])

  // ── CAD conversion ────────────────────────────────────────────────────────

  const rate     = fxResult.status === 'ok' ? fxResult.rate : null
  const mrrCad   = rate != null ? mrr   * rate : null
  const acvCad   = rate != null ? acv   * rate : null
  const tcvCad   = rate != null ? tcv   * rate : null

  // ── Product row helpers ───────────────────────────────────────────────────

  function setProduct(i: number, field: keyof ProductRow, value: string) {
    setProducts(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const rateReady  = fxResult.status === 'ok'
  const rateLoading = fxResult.status === 'loading'

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Financial Worksheet</h1>
          <p className="text-sm text-gray-500 mt-1">
            Organic recurring revenue model — based on{' '}
            <a
              href="/RevenueWorksheetTemplate.xlsx"
              download
              className="text-brand-600 hover:text-brand-700 underline underline-offset-2"
            >
              RevenueWorksheetTemplate.xlsx
            </a>
          </p>
        </div>
        {/* Billing currency picker */}
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

      {/* ── Deal type label (matches template row 5) ── */}
      <div className="bg-brand-50 border border-brand-100 rounded-xl px-5 py-3">
        <p className="text-sm font-semibold text-brand-700 uppercase tracking-wide">Type of Deal: Organic Recurring</p>
        <p className="text-xs text-brand-500 mt-0.5">Adjust fields in the products table and assumptions based on your deal.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── LEFT: Products table ── */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Products or Plans</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Name</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Unit Price</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Spread</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">ARPU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={p.name}
                        onChange={e => setProduct(i, 'name', e.target.value)}
                        placeholder="[Enter Name]"
                        className={INPUT}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={p.unitPrice}
                        onChange={e => setProduct(i, 'unitPrice', e.target.value)}
                        className={INPUT_RIGHT}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={p.spread}
                        onChange={e => setProduct(i, 'spread', e.target.value)}
                        className={INPUT_RIGHT}
                      />
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700 font-medium tabular-nums">
                      {arpu[i] > 0 ? fmtMoney(arpu[i], currency) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Summary row — mirrors template row 16 */}
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">ARPU</td>
                  <td className="px-4 py-2.5"></td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 tabular-nums">{totalSpread}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900 tabular-nums">
                    {totalArpu > 0 ? fmtMoney(totalArpu, currency) : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── RIGHT: Assumptions + Forecast ── */}
        <div className="space-y-4">

          {/* Assumptions */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assumptions</h2>
              <p className="text-xs text-gray-400 mt-0.5">Adjust fields in grey based on assumptions</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Units</label>
                  <input
                    type="number"
                    min="0"
                    value={units}
                    onChange={e => setUnits(e.target.value)}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Estimated Churn Out %</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={churnPct}
                      onChange={e => setChurnPct(e.target.value)}
                      className={`${INPUT} pr-7`}
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center text-gray-400 text-sm pointer-events-none">%</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <span className="text-sm text-gray-600">Average Revenue per Unit</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">
                  {totalArpu > 0 ? fmtMoney(totalArpu, currency) : <span className="text-gray-400">—</span>}
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
                { label: 'Monthly Recurring Rev (MRR)', billing: mrr,  cad: mrrCad },
                { label: 'Annual Contract Value (ACV)', billing: acv,  cad: acvCad },
                { label: 'Total Contract Value (TCV)',  billing: tcv,  cad: tcvCad },
              ].map(({ label, billing, cad }) => (
                <div key={label} className="px-5 py-3 flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-700 min-w-0">{label}</span>
                  <div className="flex items-center gap-6 shrink-0 tabular-nums">
                    <span className="text-sm text-gray-900 font-medium w-28 text-right">
                      {billing > 0 ? fmtMoney(billing, currency) : <span className="text-gray-300">—</span>}
                    </span>
                    <span className={`text-sm font-semibold w-28 text-right ${cad != null && cad > 0 ? 'text-green-700' : 'text-gray-300'}`}>
                      {rateLoading
                        ? <span className="text-gray-400">Loading…</span>
                        : cad != null && cad > 0
                          ? fmtMoney(cad, 'CAD')
                          : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Exchange rate info box */}
          <ExchangeRateCard currency={currency} result={fxResult} onRefresh={() => fetchRate(currency)} />
        </div>
      </div>
    </div>
  )
}

// ── Exchange Rate Card ─────────────────────────────────────────────────────────

function ExchangeRateCard({
  currency,
  result,
  onRefresh,
}: {
  currency: string
  result: ExchangeRateResult
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
        <p className="text-xs text-red-500">CAD conversions cannot be calculated. Check your network connection or API key.</p>
        <button onClick={onRefresh} className="text-xs text-red-600 hover:text-red-800 font-medium underline">Retry</button>
      </div>
    )
  }

  // status === 'ok'
  const { rate, source, fetchedAt } = result
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <p className="text-sm font-medium text-gray-700">Exchange Rate</p>
        </div>
        <button
          onClick={onRefresh}
          className="text-xs text-gray-400 hover:text-brand-600 transition-colors"
          title="Refresh rate"
        >
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
        <p>Source: {source}</p>
        {fetchedAt && <p>Rate as of: {new Date(fetchedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
      </div>
    </div>
  )
}
