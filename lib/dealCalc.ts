/**
 * Strip currency symbols, commas, whitespace, and alphabetic currency-code
 * prefixes (e.g. "CAD ", "USD "), then parse to a non-negative float.
 * Returns 0 for empty, invalid, or negative input.
 *
 * Regex /[^0-9.\-]/g keeps only digits, decimal point, and minus sign so
 * that "CAD 250,000.00" → "250000.00" → 250000 and "-100" → -100 → 0.
 */
export function parseAmount(s: string | null | undefined): number {
  if (!s) return 0
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ''))
  return isFinite(n) && n > 0 ? n : 0
}

/**
 * ACV calculation:
 *   term = 1 month  → Amount × 1  (single-month contract, not annualised)
 *   term > 1 months → Amount × 12 (annualised monthly rate)
 *   term not set    → Amount × 12 (default)
 */
export function calcACV(amount: string | number, months?: string | number | null): number {
  const a = parseAmount(String(amount))
  const m = months != null ? Math.max(0, Math.floor(parseFloat(String(months)) || 0)) : 0
  return m === 1 ? a : a * 12
}

/** TCV = Amount × Contract Term (months) */
export function calcTCV(amountStr: string, monthsStr: string): number {
  const a = parseAmount(amountStr)
  const m = Math.max(0, Math.floor(parseFloat(monthsStr) || 0))
  return a * m
}

/**
 * Normalizes revenue fields from a deal row into consistent numeric values.
 *
 * Handles every storage scenario:
 *   - Worksheet one-time deals: amount=null, value_amount=X, total_contract_value=X
 *   - Worksheet recurring deals: amount=MRR, value_amount=ACV, total_contract_value=TCV
 *   - CSV-imported deals: amount=X, value_amount=X*12, total_contract_value=null (no term)
 *   - Legacy deals (no worksheet): any combination of the above
 *
 * Returns:
 *   mrr       — monthly recurring amount; 0 if not set / one-time deal
 *   acv       — annual contract value; 0 if not computable
 *   tcv       — total contract value; 0 if no contract term
 *   term      — contract term in months; 0 if not set
 *   hasRevenue — true if ANY positive revenue indicator is present
 *   isOneTime  — true when mrr is absent but acv is present (one-time deal pattern)
 */
export function extractDealRevenue(deal: {
  amount?:               number | string | null
  value_amount?:         number | string | null
  total_contract_value?: number | string | null
  contract_term_months?: number | string | null
}): {
  mrr:        number
  acv:        number
  tcv:        number
  term:       number
  hasRevenue: boolean
  isOneTime:  boolean
} {
  const mrr  = parseAmount(String(deal.amount               ?? ''))
  const acv  = parseAmount(String(deal.value_amount         ?? ''))
  const tcv  = parseAmount(String(deal.total_contract_value ?? ''))
  const term = Math.max(0, Math.floor(parseFloat(String(deal.contract_term_months ?? '')) || 0))

  const hasRevenue = mrr > 0 || acv > 0
  // One-time pattern: MRR is absent but ACV was set (worksheet one-time, or imported deal typed as OT)
  const isOneTime  = mrr === 0 && acv > 0 && term === 0

  return { mrr, acv, tcv, term, hasRevenue, isOneTime }
}
