import type { DealStageRow } from './deals-by-stage'

const FUNNEL_STAGE_NAMES = [
  'Solution Qualified',
  'Presenting to EDM',
  'Short Listed',
  'Contract Negotiations',
  'Contract Signed',
  'Implementing',
]

// Colors modeled after reference image: blue → red → green → purple → cyan → orange
const COLORS = ['#3b82f6', '#ef4444', '#84cc16', '#a855f7', '#06b6d4', '#f97316']

const SEG_H  = 62
const TOP_W  = 270
const BOT_W  = 42
const CX     = 148   // horizontal center of the funnel cone
const LABEL_X = CX + TOP_W / 2 + 28  // where percentage labels start

function widthAt(y: number, totalH: number): number {
  return TOP_W - (TOP_W - BOT_W) * (y / totalH)
}

interface Segment {
  id:         string
  stage_name: string
  count:      number
  pct:        number
  color:      string
  path:       string
  midY:       number
  lineX1:     number
}

function buildSegments(rows: DealStageRow[], total: number): Segment[] {
  const n      = rows.length
  const totalH = n * SEG_H
  const GAP    = 2

  return rows.map((row, idx) => {
    const y0 = idx * SEG_H + (idx === 0 ? 0 : GAP / 2)
    const y1 = (idx + 1) * SEG_H - (idx === n - 1 ? 0 : GAP / 2)
    const w0 = widthAt(y0, totalH)
    const w1 = widthAt(y1, totalH)
    const midY = (y0 + y1) / 2
    const wMid = widthAt(midY, totalH)

    return {
      id:         row.id,
      stage_name: row.stage_name,
      count:      row.count,
      pct:        (row.count / total) * 100,
      color:      COLORS[idx % COLORS.length],
      path:       `M ${CX - w0 / 2} ${y0} L ${CX + w0 / 2} ${y0} L ${CX + w1 / 2} ${y1} L ${CX - w1 / 2} ${y1} Z`,
      midY,
      lineX1:     CX + wMid / 2 + 4,
    }
  })
}

export function FunnelChart({ rows }: { rows: DealStageRow[] }) {
  const funnelRows = FUNNEL_STAGE_NAMES.flatMap(name => {
    const row = rows.find(r => r.stage_name === name && r.count > 0)
    return row ? [row] : []
  })

  const total = funnelRows.reduce((s, r) => s + r.count, 0)

  if (!funnelRows.length || total === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 flex flex-col">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Pipeline Funnel</h2>
        <p className="text-sm text-gray-400">No active pipeline deals.</p>
      </div>
    )
  }

  const segments = buildSegments(funnelRows, total)
  const viewH    = funnelRows.length * SEG_H
  const viewW    = 540

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Pipeline Funnel</h2>
      </div>
      <div className="px-4 py-4">
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          className="w-full"
          style={{ maxHeight: '380px' }}
          role="img"
          aria-label="Pipeline funnel chart showing deal counts by stage"
        >
          {segments.map(seg => (
            <g key={seg.id}>
              {/* Funnel segment */}
              <path d={seg.path} fill={seg.color} />

              {/* Connector line from right edge to label */}
              <line
                x1={seg.lineX1}
                y1={seg.midY}
                x2={LABEL_X - 6}
                y2={seg.midY}
                stroke="#d1d5db"
                strokeWidth="1"
              />

              {/* Percentage */}
              <text
                x={LABEL_X}
                y={seg.midY - 4}
                fontSize="13"
                fontWeight="600"
                fill="#111827"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {seg.pct.toFixed(2)}%
              </text>

              {/* Stage name */}
              <text
                x={LABEL_X}
                y={seg.midY + 12}
                fontSize="10.5"
                fill="#6b7280"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {seg.stage_name}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
