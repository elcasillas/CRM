/**
 * Strip currency symbols, commas, and whitespace, then parse to a
 * non-negative float. Returns 0 for empty, invalid, or negative input.
 */
export function parseAmount(s: string | null | undefined): number {
  if (!s) return 0
  const n = parseFloat(String(s).replace(/[$,\s]/g, ''))
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
