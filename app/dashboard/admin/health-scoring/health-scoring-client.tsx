'use client'

import { useEffect, useState } from 'react'

type Weights = {
  stageProbability:   number
  velocity:           number
  activityRecency:    number
  closeDateIntegrity: number
  acv:                number
  notesSignal:        number
}

const WEIGHT_LABELS: { key: keyof Weights; label: string; description: string }[] = [
  { key: 'stageProbability',   label: 'Stage Probability',    description: 'Maps pipeline stage win probability (set per stage)' },
  { key: 'velocity',           label: 'Velocity',             description: 'Days in stage vs. benchmark for that stage' },
  { key: 'activityRecency',    label: 'Activity Recency',     description: 'Days since last note or activity' },
  { key: 'closeDateIntegrity', label: 'Close Date Integrity', description: 'Date realism and push-signal detection' },
  { key: 'acv',                label: 'ACV',                  description: 'Deal size percentile rank vs. all deals' },
  { key: 'notesSignal',        label: 'Notes Signal',         description: 'Positive/negative keyword sentiment in notes' },
]

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm'

export default function HealthScoringClient() {
  const [configId, setConfigId]             = useState<string>('')
  const [weights, setWeights]               = useState<Weights>({
    stageProbability: 25, velocity: 20, activityRecency: 15, closeDateIntegrity: 10, acv: 15, notesSignal: 15,
  })
  const [positiveKws, setPositiveKws]       = useState('')
  const [negativeKws, setNegativeKws]       = useState('')
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [recalculating, setRecalculating]   = useState(false)
  const [saveMsg, setSaveMsg]               = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [recalcMsg, setRecalcMsg]           = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/health-score-config')
      .then(r => r.json())
      .then(data => {
        if (data.id) setConfigId(data.id)
        if (data.weights) setWeights(data.weights)
        if (data.keywords) {
          setPositiveKws((data.keywords.positive ?? []).join('\n'))
          setNegativeKws((data.keywords.negative ?? []).join('\n'))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const weightTotal = Object.values(weights).reduce((s, v) => s + Number(v), 0)
  const totalOk = Math.abs(weightTotal - 100) < 0.5

  function updateWeight(key: keyof Weights, val: string) {
    setWeights(w => ({ ...w, [key]: Number(val) || 0 }))
    setSaveMsg(null)
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    const keywords = {
      positive: positiveKws.split('\n').map(s => s.trim()).filter(Boolean),
      negative: negativeKws.split('\n').map(s => s.trim()).filter(Boolean),
    }
    const res = await fetch('/api/admin/health-score-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: configId, weights, keywords }),
    })
    const body = await res.json()
    setSaveMsg(res.ok ? { type: 'ok', text: 'Settings saved.' } : { type: 'err', text: body.error ?? 'Save failed.' })
    setSaving(false)
  }

  async function handleRecalculate() {
    setRecalculating(true)
    setRecalcMsg(null)
    const res = await fetch('/api/admin/health-score-config/recalculate', { method: 'POST' })
    const body = await res.json()
    setRecalcMsg(res.ok ? `Updated ${body.updated} deals.` : (body.error ?? 'Recalculation failed.'))
    setRecalculating(false)
  }

  if (loading) return <div className="max-w-3xl mx-auto px-6 py-8 text-sm text-gray-400">Loading…</div>

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Health Scoring Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Tune how deal health scores are calculated. Changes apply to all future computations.</p>
      </div>

      {/* Component Weights */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Component Weights</h3>
        <p className="text-xs text-gray-400 mb-4">Each weight is a 0–100 number. Weights are divided by their sum, so the total does not need to be exactly 100 — but they must sum to 100 to save.</p>

        <div className="space-y-3">
          {WEIGHT_LABELS.map(({ key, label, description }) => (
            <div key={key} className="grid grid-cols-3 gap-4 items-center">
              <div className="col-span-2">
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-400">{description}</p>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={weights[key]}
                onChange={e => updateWeight(key, e.target.value)}
                className={INPUT}
              />
            </div>
          ))}
        </div>

        <div className={`mt-4 text-sm font-medium ${totalOk ? 'text-green-600' : 'text-red-500'}`}>
          Total: {weightTotal.toFixed(1)} {totalOk ? '✓' : '(must equal 100)'}
        </div>
      </div>

      {/* Keywords */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Notes Keywords</h3>
        <p className="text-xs text-gray-400 mb-4">One keyword per line. Matched case-insensitively against all deal notes. Each positive match adds +10 to the notes signal score (base 50); each negative subtracts 10.</p>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-medium text-green-700 mb-1.5">Positive keywords (+10 each)</label>
            <textarea
              rows={8}
              value={positiveKws}
              onChange={e => { setPositiveKws(e.target.value); setSaveMsg(null) }}
              className={`${INPUT} resize-none font-mono`}
              placeholder="budget confirmed&#10;legal engaged&#10;exec sponsor"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-red-600 mb-1.5">Negative keywords (−10 each)</label>
            <textarea
              rows={8}
              value={negativeKws}
              onChange={e => { setNegativeKws(e.target.value); setSaveMsg(null) }}
              className={`${INPUT} resize-none font-mono`}
              placeholder="no response&#10;circling back&#10;stalled"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving || !totalOk}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>

        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium px-5 py-2 rounded-lg border border-gray-300 transition-colors"
        >
          {recalculating ? 'Recalculating…' : 'Recalculate All Deals'}
        </button>

        {saveMsg && (
          <span className={`text-sm font-medium ${saveMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
            {saveMsg.text}
          </span>
        )}
        {recalcMsg && <span className="text-sm text-gray-500">{recalcMsg}</span>}
      </div>
    </div>
  )
}
