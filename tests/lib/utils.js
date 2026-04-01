/**
 * Pure utility functions mirrored from the CRM app.
 * Works in both Node.js (for generate-golden.js) and the browser (for test-harness.html).
 */

// ── Currency ──────────────────────────────────────────────────────────────────

function formatCurrency(v) {
  if (v == null || isNaN(Number(v))) return null
  const n = Number(v)
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${n.toFixed(0)}`
}

// ── Dates ─────────────────────────────────────────────────────────────────────

/** Full date: "Jan 15, 2026". Returns "—" for empty/null. */
function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Short date for deal close: "Jan 15". Returns null for empty/null. */
function formatClose(d) {
  if (!d) return null
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Relative time: "Today", "1d ago", "5d ago", "2mo ago".
 * @param {string|null} ts  - ISO timestamp string
 * @param {string|null} referenceDate - optional ISO string for deterministic tests; defaults to Date.now()
 */
function formatRelative(ts, referenceDate) {
  if (!ts) return '—'
  const ref  = referenceDate ? new Date(referenceDate).getTime() : Date.now()
  const diff = ref - new Date(ts).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30)  return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

// ── Deal calculations (mirrors lib/dealCalc.ts) ───────────────────────────────

/**
 * Strip currency symbols, commas, whitespace, and alphabetic currency-code
 * prefixes (e.g. "CAD ", "USD "), then parse to a non-negative float.
 * Returns 0 for empty, invalid, or negative input.
 */
function parseAmount(s) {
  if (s == null) return 0
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ''))
  return isFinite(n) && n > 0 ? n : 0
}

/**
 * ACV calculation:
 *   term = 1 month  → Amount × 1  (single-month contract, not annualised)
 *   term > 1 months → Amount × 12 (annualised monthly rate)
 *   term not set    → Amount × 12 (default)
 */
function calcACV(amount, months) {
  const a = parseAmount(String(amount))
  const m = months != null ? Math.max(0, Math.floor(parseFloat(String(months)) || 0)) : 0
  return m === 1 ? a : a * 12
}

/** TCV = Amount × Contract Term (months) */
function calcTCV(amountStr, monthsStr) {
  const a = parseAmount(amountStr)
  const m = Math.max(0, Math.floor(parseFloat(monthsStr) || 0))
  return a * m
}

/**
 * Normalizes revenue fields from a deal row into consistent numeric values.
 * Mirrors lib/dealCalc.ts → extractDealRevenue.
 * Handles all storage scenarios: worksheet one-time, worksheet recurring,
 * CSV-imported (with or without contract term), and legacy deals.
 */
function extractDealRevenue(deal) {
  const mrr  = parseAmount(String(deal.amount               ?? ''))
  const acv  = parseAmount(String(deal.value_amount         ?? ''))
  const tcv  = parseAmount(String(deal.total_contract_value ?? ''))
  const term = Math.max(0, Math.floor(parseFloat(String(deal.contract_term_months ?? '')) || 0))
  const hasRevenue = mrr > 0 || acv > 0
  const isOneTime  = mrr === 0 && acv > 0 && term === 0
  return { mrr, acv, tcv, term, hasRevenue, isOneTime }
}

/**
 * Mirrors the amount_reasonable check from lib/deal-inspect.ts.
 * Returns 'pass' or 'missing'.
 */
function amountReasonableStatus(deal) {
  const rev = extractDealRevenue(deal)
  return rev.hasRevenue ? 'pass' : 'missing'
}

/**
 * Mirrors the acv_tcv_aligned check from lib/deal-inspect.ts.
 * Returns 'pass', 'missing', or 'mismatch'.
 */
function acvTcvAlignedStatus(deal) {
  const rev = extractDealRevenue(deal)
  if (rev.acv <= 0) return 'missing'
  if (rev.tcv <= 0 && rev.term > 0) return 'missing'
  if (rev.tcv <= 0) return 'pass'  // one-time or no term — ACV alone is acceptable
  const expectedTcv = rev.term === 1 ? rev.acv : (rev.mrr > 0 ? rev.mrr * rev.term : rev.acv)
  const ratio = expectedTcv > 0 ? Math.abs(rev.tcv - expectedTcv) / expectedTcv : 0
  if (ratio > 0.05 && expectedTcv > 0) return 'mismatch'
  return 'pass'
}

// ── Stage badges ──────────────────────────────────────────────────────────────

function stageBadgeClass(s) {
  if (!s) return 'bg-gray-100 text-gray-600'
  if (s.is_lost) return 'bg-red-50 text-red-600 ring-1 ring-red-200'
  if (s.is_won)  return 'bg-green-50 text-green-700 ring-1 ring-green-200'
  if (s.sort_order <= 3) return 'bg-gray-100 text-gray-700'
  if (s.sort_order <= 5) return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
  return 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'
}

function stageHeaderClass(s) {
  if (!s) return 'text-gray-600'
  if (s.is_lost) return 'text-red-500'
  if (s.is_won)  return 'text-green-600'
  if (s.sort_order <= 3) return 'text-gray-600'
  if (s.sort_order <= 5) return 'text-amber-600'
  return 'text-orange-600'
}

/**
 * Health score badge CSS classes.
 *   score >= 80 → green
 *   score >= 60 → amber
 *   otherwise   → red
 */
function healthBadgeClass(score) {
  if (score == null) return 'bg-gray-100 text-gray-400'
  if (score >= 80) return 'bg-green-100 text-green-700'
  if (score >= 60) return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-600'
}

// ── Stale / overdue ───────────────────────────────────────────────────────────

/**
 * Returns true if days since lastNoteTs >= staleDays.
 * @param {string|null} lastNoteTs - ISO timestamp of last note
 * @param {number} staleDays
 * @param {string|null} referenceDate - ISO string for deterministic tests; defaults to Date.now()
 */
function isStale(lastNoteTs, staleDays, referenceDate) {
  if (!lastNoteTs) return false
  const ref = referenceDate ? new Date(referenceDate).getTime() : Date.now()
  const days = Math.floor((ref - new Date(lastNoteTs).getTime()) / 86400000)
  return days >= staleDays
}

/**
 * Returns true if close_date is in the past and the deal is not closed.
 * @param {string|null} closeDate - 'YYYY-MM-DD' string
 * @param {boolean} isClosed - whether the deal's stage has is_closed = true
 * @param {string|null} referenceDate - ISO string (uses date portion only)
 */
function isOverdue(closeDate, isClosed, referenceDate) {
  if (!closeDate || isClosed) return false
  const todayStr = referenceDate
    ? new Date(referenceDate).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10)
  return closeDate < todayStr
}

// ── Filtering ─────────────────────────────────────────────────────────────────

/**
 * Filter deals by search string, stage ID, and/or activeOnly.
 * @param {object[]} deals
 * @param {{ search?: string, stageId?: string, activeOnly?: boolean }} opts
 */
function filterDeals(deals, { search = '', stageId = '', activeOnly = false } = {}) {
  return deals.filter(d => {
    if (activeOnly && d.deal_stages?.is_closed) return false
    const q = search.toLowerCase()
    const matchSearch = !q
      || d.deal_name.toLowerCase().includes(q)
      || (d.accounts?.account_name ?? '').toLowerCase().includes(q)
    const matchStage = !stageId || d.stage_id === stageId
    return matchSearch && matchStage
  })
}

/** Filter accounts by search string and/or status. */
function filterAccounts(accounts, { search = '', status = '' } = {}) {
  return accounts.filter(a => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || a.account_name.toLowerCase().includes(q)
      || (a.city    ?? '').toLowerCase().includes(q)
      || (a.country ?? '').toLowerCase().includes(q)
    const matchStatus = !status || a.status === status
    return matchSearch && matchStatus
  })
}

// ── Stage totals ──────────────────────────────────────────────────────────────

/** Sum ACV for all deals in a given stage. Returns formatted string or null if zero. */
function stageTotal(deals, stageId) {
  const total = deals
    .filter(d => d.stage_id === stageId)
    .reduce((s, d) => s + (d.value_amount != null ? Number(d.value_amount) : 0), 0)
  return total > 0 ? formatCurrency(total) : null
}

// ── Node.js export ────────────────────────────────────────────────────────────

if (typeof module !== 'undefined') {
  module.exports = {
    formatCurrency, fmtDate, formatClose, formatRelative,
    parseAmount, calcACV, calcTCV,
    healthBadgeClass, stageBadgeClass, stageHeaderClass,
    isStale, isOverdue,
    filterDeals, filterAccounts, stageTotal,
  }
}
