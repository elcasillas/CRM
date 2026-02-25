// Deal health scoring — ported from DealUpdates (github.com/elcasillas/DealUpdates)
// Computes a composite score (0-100) from 6 weighted components.

const MS_PER_DAY = 86_400_000

const PUSH_SIGNALS = ['pushed', 'delayed', 'moved out', 'rescheduled']

const POSITIVE_KEYWORDS = [
  'budget confirmed',
  'legal engaged',
  'exec sponsor',
  'timeline committed',
  'verbal commit',
  'procurement',
]

const NEGATIVE_KEYWORDS = [
  'no response',
  'circling back',
  'waiting on approval',
  'reviewing internally',
  'pushed',
  'delayed',
  'stalled',
]

// Default stage benchmark (days expected in stage) — used for velocity
const STAGE_BENCHMARKS: Record<string, number> = {
  'solution qualified': 14,
  'presenting to edm':  21,
  'short listed':       21,
  'contract negotiations': 28,
  'contract signed':    14,
  'implementing':       30,
}

export interface CRMDealInput {
  win_probability:  number | null   // from deal_stages.win_probability
  stage_name:       string | null   // for benchmark lookup + close date check
  value_amount:     number | null
  close_date:       string | null   // ISO date string
  last_activity_at: string | null   // ISO timestamp
  deal_notes:       string | null   // inline notes field
  latestNoteAt:     string | null   // created_at of most recent activity note
  allNotesText:     string          // all activity notes concatenated
}

export interface HealthScoreComponents {
  stageProbability: number
  velocity:         number
  activityRecency:  number
  closeDateIntegrity: number
  acv:              number
  notesSignal:      number
}

export interface HealthScoreResult {
  score:      number
  components: HealthScoreComponents
  debug:      Record<string, unknown>
}

// ── Component functions ───────────────────────────────────────────────────────

function scoreStageProbability(winProbability: number | null): number {
  if (winProbability == null) return 35
  return Math.max(0, Math.min(100, winProbability))
}

function scoreVelocity(daysSinceActivity: number | null, stageName: string | null): number {
  if (daysSinceActivity == null) return 70
  const key = (stageName || '').toLowerCase()
  const benchmark = STAGE_BENCHMARKS[key] ?? 21
  const ratio = daysSinceActivity / benchmark
  if (ratio <= 0.8) return 100
  if (ratio <= 1.2) return 70
  if (ratio <= 1.5) return 40
  return 10
}

function scoreActivityRecency(latestNoteAt: string | null, lastActivityAt: string | null): number {
  const ts = latestNoteAt || lastActivityAt
  if (!ts) return 40
  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)
  const days = Math.max(0, Math.floor((todayMidnight.getTime() - new Date(ts).getTime()) / MS_PER_DAY))
  if (days <= 7)  return 100
  if (days <= 14) return 70
  if (days <= 30) return 40
  return 10
}

function scoreCloseDateIntegrity(closeDate: string | null, stageName: string | null, notesText: string): number {
  let base: number

  if (!closeDate) {
    base = 60
  } else {
    const todayMidnight = new Date()
    todayMidnight.setHours(0, 0, 0, 0)
    const daysUntil = Math.ceil((new Date(closeDate).getTime() - todayMidnight.getTime()) / MS_PER_DAY)
    const stageKey = (stageName || '').toLowerCase()
    if (daysUntil < 0) {
      base = stageKey.includes('implement') || stageKey.includes('won') ? 100 : 10
    } else if (daysUntil <= 30) {
      base = 70
    } else {
      base = 100
    }
  }

  const text = notesText.toLowerCase()
  let pushCount = 0
  for (const signal of PUSH_SIGNALS) {
    if (text.includes(signal)) pushCount++
  }

  return Math.max(10, Math.min(100, base - pushCount * 20))
}

function scoreAcv(valueAmount: number | null, acvDistribution: number[]): number {
  if (!valueAmount || valueAmount <= 0) return 40
  if (acvDistribution.length === 0) return 40
  const below = acvDistribution.filter(v => v < valueAmount).length
  const percentile = below / acvDistribution.length
  if (percentile >= 0.8) return 100
  if (percentile >= 0.4) return 70
  return 40
}

function scoreNotesSignal(notesText: string): { score: number; positive: string[]; negative: string[] } {
  const text = notesText.toLowerCase()
  let score = 50
  const positive: string[] = []
  const negative: string[] = []
  for (const kw of POSITIVE_KEYWORDS) {
    if (text.includes(kw)) { positive.push(kw); score += 10 }
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    if (text.includes(kw)) { negative.push(kw); score -= 10 }
  }
  return { score: Math.max(0, Math.min(100, score)), positive, negative }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeDealHealthScore(
  deal: CRMDealInput,
  acvDistribution: number[],
): HealthScoreResult {
  const weights = {
    stageProbability:   25,
    velocity:           20,
    activityRecency:    15,
    closeDateIntegrity: 10,
    acv:                15,
    notesSignal:        15,
  }

  const allText = [deal.deal_notes ?? '', deal.allNotesText].join(' ')

  // Days since last_activity_at (for velocity proxy)
  let daysSinceActivity: number | null = null
  if (deal.last_activity_at) {
    const todayMidnight = new Date()
    todayMidnight.setHours(0, 0, 0, 0)
    daysSinceActivity = Math.max(0, Math.floor(
      (todayMidnight.getTime() - new Date(deal.last_activity_at).getTime()) / MS_PER_DAY
    ))
  }

  const notesResult = scoreNotesSignal(allText)

  const components: HealthScoreComponents = {
    stageProbability:   scoreStageProbability(deal.win_probability),
    velocity:           scoreVelocity(daysSinceActivity, deal.stage_name),
    activityRecency:    scoreActivityRecency(deal.latestNoteAt, deal.last_activity_at),
    closeDateIntegrity: scoreCloseDateIntegrity(deal.close_date, deal.stage_name, allText),
    acv:                scoreAcv(deal.value_amount, acvDistribution),
    notesSignal:        notesResult.score,
  }

  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0)
  const weightedSum = (Object.keys(weights) as (keyof typeof weights)[]).reduce(
    (s, k) => s + weights[k] * components[k], 0
  )

  const score = Math.max(0, Math.min(100, Math.round(weightedSum / totalWeight)))

  return {
    score,
    components,
    debug: {
      daysSinceActivity,
      stageName: deal.stage_name,
      notesKeywords: { positive: notesResult.positive, negative: notesResult.negative },
    },
  }
}
