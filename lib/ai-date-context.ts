// ── Shared date awareness for AI generation ──────────────────────────────────
// Single source of truth for making generated content (deal inspection
// questions, owner emails, copied templates) evaluate every referenced date
// against the current date. Both the inspection prompt and the compose-email
// prompt build their date context from here so the rules cannot diverge.

export type DateClass = 'past' | 'current' | 'future' | 'ambiguous'

export interface DateRef {
  /** the literal text as it appeared in the source */
  text: string
  classification: DateClass
  /** short human explanation, e.g. "ended about 11 months ago" */
  note: string
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
}

const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')

/** Inclusive span a reference covers, plus whether it names a single day. */
interface Span { start: Date; end: Date }

function day(y: number, m: number, d: number): Date { return new Date(y, m, d) }
function monthSpan(y: number, m: number): Span { return { start: day(y, m, 1), end: day(y, m + 1, 0) } }
function quarterSpan(y: number, q: number): Span { return { start: day(y, (q - 1) * 3, 1), end: day(y, q * 3, 0) } }
function halfSpan(y: number, h: number): Span { return { start: day(y, (h - 1) * 6, 1), end: day(y, h * 6, 0) } }
function yearSpan(y: number): Span { return { start: day(y, 0, 1), end: day(y, 11, 31) } }

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

/** "about 11 months ago" / "in about 2 months" / "3 days ago" */
function describeDistance(span: Span, today: Date, isSingleDay: boolean): string {
  const dayMs = 86_400_000
  if (span.end < today) {
    const days = Math.round((today.getTime() - span.end.getTime()) / dayMs)
    if (days < 31) return isSingleDay ? `${days} day${days === 1 ? '' : 's'} ago` : `ended ${days} day${days === 1 ? '' : 's'} ago`
    const mo = Math.max(1, monthsBetween(span.end, today))
    return `${isSingleDay ? '' : 'ended '}about ${mo} month${mo === 1 ? '' : 's'} ago`
  }
  if (span.start > today) {
    const days = Math.round((span.start.getTime() - today.getTime()) / dayMs)
    if (days < 31) return `in ${days} day${days === 1 ? '' : 's'}`
    const mo = Math.max(1, monthsBetween(today, span.start))
    return `starts in about ${mo} month${mo === 1 ? '' : 's'}`
  }
  return 'in progress now'
}

function classifySpan(span: Span, today: Date, isSingleDay = false): { classification: DateClass; note: string } {
  const note = describeDistance(span, today, isSingleDay)
  if (span.end < today) return { classification: 'past', note }
  if (span.start > today) return { classification: 'future', note }
  return { classification: 'current', note }
}

/**
 * Relative expressions ("next month", "end of Q3") are anchored to whenever the
 * text was written, which is usually unknown and often long past — so they are
 * reported as ambiguous rather than assumed to still lie ahead.
 */
const RELATIVE_PATTERNS = [
  /\bnext\s+(?:month|quarter|week|year|sprint)\b/gi,
  /\b(?:this|current)\s+(?:month|quarter|week|year)\b/gi,
  /\b(?:later|early|earlier)\s+this\s+(?:month|quarter|year)\b/gi,
  /\b(?:in|within)\s+(?:the\s+)?(?:next\s+)?\d+\s+(?:days?|weeks?|months?|quarters?)\b/gi,
  /\b(?:end|beginning|start|mid)\s+of\s+(?:the\s+)?(?:month|quarter|year)\b/gi,
  /\b(?:eoy|eoq|eom)\b/gi,
  /\b(?:soon|shortly|imminently|asap)\b/gi,
]

/**
 * Extract date references from free text and classify each against `today`.
 * Deterministic — no model involvement — so the same text always yields the
 * same classification.
 */
export function extractDateRefs(text: string, today: Date): DateRef[] {
  if (!text) return []
  const out: DateRef[] = []
  const seen = new Set<string>()

  const push = (raw: string, res: { classification: DateClass; note: string }) => {
    const key = raw.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push({ text: raw.trim(), classification: res.classification, note: res.note })
  }

  // ISO — 2025-08-15
  for (const m of text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    const y = +m[1], mo = +m[2] - 1, d = +m[3]
    if (mo < 0 || mo > 11 || d < 1 || d > 31) continue
    push(m[0], classifySpan({ start: day(y, mo, d), end: day(y, mo, d) }, today, true))
  }

  // US slash — 08/15/2025 (month/day/year)
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
    const mo = +m[1] - 1, d = +m[2], y = +m[3]
    if (mo < 0 || mo > 11 || d < 1 || d > 31) continue
    push(m[0], classifySpan({ start: day(y, mo, d), end: day(y, mo, d) }, today, true))
  }

  // Month name with year, optional day — "August 2025", "Aug 15, 2025"
  const monthRe = new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(?:(\\d{1,2})(?:st|nd|rd|th)?,?\\s+)?(\\d{4})\\b`, 'gi')
  for (const m of text.matchAll(monthRe)) {
    const mo = MONTHS[m[1].toLowerCase()]
    const y = +m[3]
    if (mo == null) continue
    // skip when a leading day number makes this part of "15 August 2027"
    if (m.index != null && /\d\s*$/.test(text.slice(Math.max(0, m.index - 4), m.index))) continue
    if (m[2]) {
      const d = +m[2]
      push(m[0], classifySpan({ start: day(y, mo, d), end: day(y, mo, d) }, today, true))
    } else {
      push(m[0], classifySpan(monthSpan(y, mo), today))
    }
  }

  // "15 August 2025"
  const dayFirstRe = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?\\s+(\\d{4})\\b`, 'gi')
  for (const m of text.matchAll(dayFirstRe)) {
    const mo = MONTHS[m[2].toLowerCase()]
    if (mo == null) continue
    push(m[0], classifySpan({ start: day(+m[3], mo, +m[1]), end: day(+m[3], mo, +m[1]) }, today, true))
  }

  // Quarters — "Q2 2026", "2026 Q2", "Q2 of 2026", "Q2-2026"
  for (const m of text.matchAll(/\bQ([1-4])\s*(?:of\s+)?[-/ ]?\s*(\d{4})\b/gi)) {
    push(m[0], classifySpan(quarterSpan(+m[2], +m[1]), today))
  }
  for (const m of text.matchAll(/\b(\d{4})\s*[-/ ]?\s*Q([1-4])\b/gi)) {
    push(m[0], classifySpan(quarterSpan(+m[1], +m[2]), today))
  }

  // Halves — "H1 2026", "1H26" style kept simple
  for (const m of text.matchAll(/\bH([12])\s*(?:of\s+)?[-/ ]?\s*(\d{4})\b/gi)) {
    push(m[0], classifySpan(halfSpan(+m[2], +m[1]), today))
  }

  // "end of 2025", "mid-2026", "beginning of 2027"
  for (const m of text.matchAll(/\b(end|beginning|start|mid|middle|early|late)\s*(?:of\s+)?[-\s]?(\d{4})\b/gi)) {
    const y = +m[2]
    const word = m[1].toLowerCase()
    const span =
      word === 'end' || word === 'late' ? { start: day(y, 9, 1), end: day(y, 11, 31) }
      : word === 'mid' || word === 'middle' ? { start: day(y, 4, 1), end: day(y, 7, 31) }
      : { start: day(y, 0, 1), end: day(y, 3, 30) }
    push(m[0], classifySpan(span, today))
  }

  // Fiscal/calendar year alone — "in 2025", "FY2026"
  for (const m of text.matchAll(/\b(?:FY\s*)?(20\d{2})\b/gi)) {
    const y = +m[1]
    const key = m[0].trim().toLowerCase()
    // skip if this year was already captured as part of a richer reference
    if ([...seen].some(s => s.includes(String(y)))) continue
    push(key, classifySpan(yearSpan(y), today))
  }

  // Relative expressions — anchor unknown, so never asserted as future
  for (const re of RELATIVE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      push(m[0], {
        classification: 'ambiguous',
        note: 'relative to when the note was written, which may itself be long past, so do not assume it is still upcoming',
      })
    }
  }

  return out
}

/**
 * The "Last note:" line that heads generated follow-up content. Calendar-day
 * difference against today, so a note from late yesterday reads as 1 day ago
 * rather than rounding by elapsed hours.
 */
export type LastNoteStyle = 'prefixed' | 'suffixed'

export function formatLastNoteLine(
  latestNoteAt: string | null | undefined,
  today: Date,
  style: LastNoteStyle = 'prefixed',
): string {
  const suffixed = style === 'suffixed'
  if (!latestNoteAt) return suffixed ? 'No notes available' : 'Last note: none recorded'
  const noted = new Date(latestNoteAt)
  if (isNaN(noted.getTime())) return suffixed ? 'No notes available' : 'Last note: none recorded'
  const a = day(today.getFullYear(), today.getMonth(), today.getDate())
  const b = day(noted.getFullYear(), noted.getMonth(), noted.getDate())
  const days = Math.round((a.getTime() - b.getTime()) / 86_400_000)
  if (days <= 0) return suffixed ? 'Today' : 'Last note: Today'
  if (days === 1) return suffixed ? '1 day since last note' : 'Last note: 1 day ago'
  return suffixed ? `${days} days since last note` : `Last note: ${days} days ago`
}

/** Format today's date for prompt context, e.g. "Monday, August 24, 2026". */
export function formatToday(today: Date): string {
  return today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

const CLASS_LABEL: Record<DateClass, string> = {
  past: 'PAST',
  current: 'CURRENT',
  future: 'FUTURE',
  ambiguous: 'AMBIGUOUS',
}

/**
 * Build the date-context block injected into an AI prompt: today's date plus
 * every date found in `sources`, classified past/current/future/ambiguous.
 */
export function buildDateContext(sources: Array<string | null | undefined>, today: Date, maxRefs = 40): string {
  const combined = sources.filter(Boolean).join('\n')
  const refs = extractDateRefs(combined, today).slice(0, maxRefs)

  let block = `TODAY'S DATE: ${formatToday(today)}\n`
  if (refs.length === 0) {
    block += '\nNo explicit dates were found in the deal data or notes. Do not invent any.'
    return block
  }

  const pastCount = refs.filter(r => r.classification === 'past').length
  block += '\nDATES REFERENCED IN THE DEAL DATA AND NOTES, classified against today:\n'
  block += refs.map(r => `- "${r.text}" → ${CLASS_LABEL[r.classification]} (${r.note})`).join('\n')
  if (pastCount > 0) {
    block += `\n\n${pastCount} of these date${pastCount === 1 ? ' is' : 's are'} already in the past. Treat ${pastCount === 1 ? 'it' : 'them'} as history, never as an upcoming milestone.`
  }
  return block
}

/**
 * The date-awareness rules appended to the system prompt of every AI
 * generation path. Wording is deliberately generation-agnostic so email,
 * template, and inspection outputs all follow identical logic.
 */
export const DATE_AWARENESS_RULES = `DATE AWARENESS (mandatory):
- Today's date is supplied in the user message. Evaluate every date, month, quarter, half-year, deadline, target date, milestone, and expected completion date against it.
- The user message lists dates found in the deal data, already classified as PAST, CURRENT, FUTURE, or AMBIGUOUS. Trust those classifications over your own impression.
- Never describe a PAST date as upcoming, planned, or still targeted.
- Never ask whether something "will happen", "will slip", "will delay", "is still on track for", or "is still targeting" a PAST date.
- For a PAST milestone, convert "Will X happen?" into "Did X happen? If not, what is the current status and the revised date?" Ask about the actual outcome.
- You may cite a past date as historical context. Say it "was previously identified" or "was the planned date" and note that it has passed. The question itself must still be about current status, outcome, or next steps.
- Never invent or guess a replacement date. If no newer date exists in the data, ask the rep for the current or revised target date.
- Treat AMBIGUOUS references as unverified. Do not assert they are still in the future; ask for a concrete date instead.
- FUTURE dates are still actionable. Ask normal forward looking questions about them.
- Prioritise unresolved items that matter now or later: current status, outstanding decisions, next steps, blockers, and owners.`
