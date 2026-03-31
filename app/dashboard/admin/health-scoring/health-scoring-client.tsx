'use client'

import { useEffect, useRef, useState } from 'react'
import { useBeforeUnload, formIsDirty } from '@/hooks/useUnsavedChanges'

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

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20 text-sm'

export default function HealthScoringClient() {
  const [configId, setConfigId]             = useState<string>('')
  const [weights, setWeights]               = useState<Weights>({
    stageProbability: 25, velocity: 20, activityRecency: 15, closeDateIntegrity: 10, acv: 15, notesSignal: 15,
  })
  const [positiveKws, setPositiveKws]       = useState('')
  const [negativeKws, setNegativeKws]       = useState('')
  const [staleDays, setStaleDays]           = useState(30)
  const [newDealDays, setNewDealDays]       = useState(14)
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [recalculating, setRecalculating]   = useState(false)
  const [saveMsg, setSaveMsg]               = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [recalcMsg, setRecalcMsg]           = useState<string | null>(null)

  // Unsaved changes tracking
  const initialConfigRef = useRef<{ weights: Weights; staleDays: number; newDealDays: number; positiveKws: string; negativeKws: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/health-score-config')
      .then(r => r.json())
      .then(data => {
        if (data.id) setConfigId(data.id)
        const loadedWeights     = data.weights ?? { stageProbability: 25, velocity: 20, activityRecency: 15, closeDateIntegrity: 10, acv: 15, notesSignal: 15 }
        const loadedPositiveKws = (data.keywords?.positive ?? []).join('\n')
        const loadedNegativeKws = (data.keywords?.negative ?? []).join('\n')
        const loadedStaleDays   = data.stale_days   ?? 30
        const loadedNewDealDays = data.new_deal_days ?? 14
        setWeights(loadedWeights)
        setPositiveKws(loadedPositiveKws)
        setNegativeKws(loadedNegativeKws)
        setStaleDays(loadedStaleDays)
        setNewDealDays(loadedNewDealDays)
        initialConfigRef.current = { weights: loadedWeights, staleDays: loadedStaleDays, newDealDays: loadedNewDealDays, positiveKws: loadedPositiveKws, negativeKws: loadedNegativeKws }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const weightTotal = Object.values(weights).reduce((s, v) => s + Number(v), 0)
  const totalOk = Math.abs(weightTotal - 100) < 0.5

  const isDirty = formIsDirty(
    { weights, staleDays, newDealDays, positiveKws, negativeKws },
    initialConfigRef.current
  )
  useBeforeUnload(isDirty)

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
      body: JSON.stringify({ id: configId, weights, keywords, stale_days: staleDays, new_deal_days: newDealDays }),
    })
    const body = await res.json()
    if (res.ok) {
      setSaveMsg({ type: 'ok', text: 'Settings saved.' })
      initialConfigRef.current = { weights, staleDays, newDealDays, positiveKws, negativeKws }
    } else {
      setSaveMsg({ type: 'err', text: body.error ?? 'Save failed.' })
    }
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

      {/* Stale Deal Threshold */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Stale Deal Threshold</h3>
        <p className="text-xs text-gray-400 mb-4">Number of days since the last note before a deal is considered stale. Stale deals are highlighted in the Deals table.</p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="1"
            max="365"
            step="1"
            value={staleDays}
            onChange={e => { setStaleDays(Number(e.target.value) || 30); setSaveMsg(null) }}
            className="w-32 bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20 text-sm"
          />
          <span className="text-sm text-gray-500">days</span>
        </div>
      </div>

      {/* New Deal Badge Threshold */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">New Deal Badge</h3>
        <p className="text-xs text-gray-400 mb-4">Deals created within this many days will show a <span className="inline-flex px-1.5 py-0 rounded text-xs font-medium bg-[#E6F7F8] text-[#00ADB1] ring-1 ring-[#00ADB1]/30">New</span> badge in the Deals table.</p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="1"
            max="365"
            step="1"
            value={newDealDays}
            onChange={e => { setNewDealDays(Number(e.target.value) || 14); setSaveMsg(null) }}
            className="w-32 bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-[#00ADB1] focus:ring-1 focus:ring-[#00ADB1]/20 text-sm"
          />
          <span className="text-sm text-gray-500">days</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving || !totalOk}
          className="bg-[#00ADB1] hover:bg-[#00989C] disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
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

      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 bg-amber-50 border-t border-amber-200 px-6 py-3 flex items-center justify-between z-40">
          <span className="text-sm text-amber-800 font-medium">You have unsaved changes</span>
          <div className="flex gap-3">
            <button onClick={() => {
              if (initialConfigRef.current) {
                setWeights(initialConfigRef.current.weights)
                setStaleDays(initialConfigRef.current.staleDays)
                setNewDealDays(initialConfigRef.current.newDealDays)
                setPositiveKws(initialConfigRef.current.positiveKws)
                setNegativeKws(initialConfigRef.current.negativeKws)
              }
            }} className="text-sm text-amber-700 hover:text-amber-900 font-medium">
              Discard
            </button>
            <button onClick={handleSave} disabled={saving || !totalOk} className="text-sm font-medium text-white bg-[#00ADB1] hover:bg-[#00989C] disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
