/**
 * Regenerate golden (expected) files from current fixtures.
 *
 * Usage:
 *   node tests/fixtures/generate-golden.js
 *
 * A fixed reference date is used for formatRelative() so results are
 * deterministic regardless of when the script is run.
 */

const {
  formatCurrency, fmtDate, formatClose, formatRelative,
  stageBadgeClass, filterDeals, filterAccounts, stageTotal,
} = require('../lib/utils.js')

const fs   = require('fs')
const path = require('path')

const REFERENCE_DATE = '2026-02-23T12:00:00.000Z'
const FIXTURES_DIR   = __dirname
const EXPECTED_DIR   = path.join(__dirname, 'expected')

if (!fs.existsSync(EXPECTED_DIR)) fs.mkdirSync(EXPECTED_DIR)

function write(name, data) {
  const dest = path.join(EXPECTED_DIR, name)
  fs.writeFileSync(dest, JSON.stringify(data, null, 2) + '\n')
  console.log(`  ✓  ${name}`)
}

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'))
}

console.log('Generating golden files…\n')

// ── 01  Currency formatting ───────────────────────────────────────────────────
;(() => {
  const { cases } = load('01_currency_formatting.json')
  write('01_currency_formatting.json',
    cases.map(c => ({ label: c.label, input: c.input, result: formatCurrency(c.input) }))
  )
})()

// ── 02  Date formatting ───────────────────────────────────────────────────────
;(() => {
  const { cases } = load('02_date_formatting.json')
  write('02_date_formatting.json',
    cases.map(c => ({
      label:       c.label,
      input:       c.input,
      fmtDate:     fmtDate(c.input),
      formatClose: formatClose(c.input),
    }))
  )
})()

// ── 03  Relative time ─────────────────────────────────────────────────────────
;(() => {
  const { cases } = load('03_relative_time.json')
  write('03_relative_time.json',
    cases.map(c => ({ label: c.label, input: c.input, result: formatRelative(c.input, REFERENCE_DATE) }))
  )
})()

// ── 04  Deal filtering ────────────────────────────────────────────────────────
;(() => {
  const { deals, cases } = load('04_deal_filtering.json')
  write('04_deal_filtering.json',
    cases.map(c => ({
      label:     c.label,
      filters:   c.filters,
      resultIds: filterDeals(deals, c.filters).map(d => d.id),
    }))
  )
})()

// ── 05  Account filtering ─────────────────────────────────────────────────────
;(() => {
  const { accounts, cases } = load('05_account_filtering.json')
  write('05_account_filtering.json',
    cases.map(c => ({
      label:     c.label,
      filters:   c.filters,
      resultIds: filterAccounts(accounts, c.filters).map(a => a.id),
    }))
  )
})()

// ── 06  Stage totals ──────────────────────────────────────────────────────────
;(() => {
  const { deals, cases } = load('06_stage_totals.json')
  write('06_stage_totals.json',
    cases.map(c => ({ label: c.label, stageId: c.stageId, result: stageTotal(deals, c.stageId) }))
  )
})()

console.log('\nDone. Golden files written to tests/fixtures/expected/')
