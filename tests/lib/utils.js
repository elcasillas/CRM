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

// ── Filtering ─────────────────────────────────────────────────────────────────

/** Filter deals by search string and/or stage ID. */
function filterDeals(deals, { search = '', stageId = '' } = {}) {
  return deals.filter(d => {
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
    stageBadgeClass, stageHeaderClass,
    filterDeals, filterAccounts, stageTotal,
  }
}
