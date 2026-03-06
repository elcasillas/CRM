/**
 * Strip currency symbols, commas, and whitespace, then parse to a
 * non-negative float. Returns 0 for empty, invalid, or negative input.
 */
export function parseAmount(s: string | null | undefined): number {
  if (!s) return 0
  const n = parseFloat(String(s).replace(/[$,\s]/g, ''))
  return isFinite(n) && n > 0 ? n : 0
}

/** ACV = Amount × 12 (annualised monthly rate) */
export function calcACV(amountStr: string): number {
  return parseAmount(amountStr) * 12
}

/** TCV = Amount × Contract Term (months) */
export function calcTCV(amountStr: string, monthsStr: string): number {
  const a = parseAmount(amountStr)
  const m = Math.max(0, Math.floor(parseFloat(monthsStr) || 0))
  return a * m
}
