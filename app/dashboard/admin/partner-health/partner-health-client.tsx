'use client'

import { useState } from 'react'
import type { PartnerHealthConfig } from '@/lib/partner-types'
import { CATEGORY_LABELS, CATEGORY_ORDER, DEFAULT_WEIGHTS } from '@/lib/partner-health'

const INPUT = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100 text-sm'
const LABEL = 'block text-xs font-medium text-gray-600 mb-1'

export default function PartnerHealthConfigClient({ config }: { config: PartnerHealthConfig | null }) {
  const defaultConfig = config ?? {
    id: '',
    category_weights: DEFAULT_WEIGHTS,
    thresholds: { healthy: 75, at_risk: 50, critical: 25 },
    stale_days: 30,
    model_version: 'phi-1',
  }

  const [weights,      setWeights]      = useState<Record<string, number>>(defaultConfig.category_weights)
  const [thresholds,   setThresholds]   = useState(defaultConfig.thresholds)
  const [staleDays,    setStaleDays]    = useState(String(defaultConfig.stale_days))
  const [modelVersion, setModelVersion] = useState(defaultConfig.model_version)

  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [saved,       setSaved]       = useState(false)
  const [recalcing,   setRecalcing]   = useState(false)
  const [recalcResult, setRecalcResult] = useState('')

  const weightsTotal = Object.values(weights).reduce((s, v) => s + (Number(v) || 0), 0)
  const weightsValid = Math.abs(weightsTotal - 100) <= 0.5

  function setWeight(key: string, val: string) {
    setWeights(prev => ({ ...prev, [key]: parseFloat(val) || 0 }))
  }

  function setThreshold(key: 'healthy' | 'at_risk' | 'critical', val: string) {
    setThresholds(prev => ({ ...prev, [key]: parseInt(val) || 0 }))
  }

  async function handleSave() {
    if (!weightsValid) {
      setError(`Weights must sum to 100 (current total: ${weightsTotal.toFixed(1)})`)
      return
    }
    if (thresholds.healthy <= thresholds.at_risk || thresholds.at_risk <= thresholds.critical) {
      setError('Thresholds must be in order: Healthy > At Risk > Critical')
      return
    }
    setSaving(true); setError(''); setSaved(false)
    const res = await fetch('/api/admin/partner-health-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:               defaultConfig.id,
        category_weights: weights,
        thresholds,
        stale_days:       parseInt(staleDays) || 30,
        model_version:    modelVersion,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleRecalculate() {
    setRecalcing(true); setRecalcResult('')
    const res  = await fetch('/api/admin/partner-health-config/recalculate', { method: 'POST' })
    const json = await res.json()
    setRecalcing(false)
    if (!res.ok) { setRecalcResult(`Error: ${json.error}`); return }
    setRecalcResult(`Recalculated ${json.updated} partner${json.updated !== 1 ? 's' : ''} ✓`)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Partner Health Config</h1>
      <p className="text-sm text-gray-500 mb-8">Configure scoring weights, health thresholds, and staleness settings.</p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-6">{error}</div>
      )}

      {/* Category Weights */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-800">Category Weights</h2>
          <span className={`text-sm font-medium ${weightsValid ? 'text-green-600' : 'text-red-500'}`}>
            Total: {weightsTotal.toFixed(1)} / 100
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {CATEGORY_ORDER.map(key => (
            <div key={key}>
              <label className={LABEL}>{CATEGORY_LABELS[key] ?? key}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={weights[key] ?? 0}
                  onChange={e => setWeight(key, e.target.value)}
                  className={INPUT}
                />
                <span className="text-xs text-gray-400 flex-shrink-0">%</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">All weights must sum to exactly 100.</p>
      </section>

      {/* Thresholds */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Health Status Thresholds</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={`${LABEL} text-green-600`}>Healthy ≥</label>
            <div className="flex items-center gap-1">
              <input type="number" min="0" max="100" value={thresholds.healthy} onChange={e => setThreshold('healthy', e.target.value)} className={INPUT} />
              <span className="text-xs text-gray-400">pts</span>
            </div>
          </div>
          <div>
            <label className={`${LABEL} text-amber-600`}>At Risk ≥</label>
            <div className="flex items-center gap-1">
              <input type="number" min="0" max="100" value={thresholds.at_risk} onChange={e => setThreshold('at_risk', e.target.value)} className={INPUT} />
              <span className="text-xs text-gray-400">pts</span>
            </div>
          </div>
          <div>
            <label className={`${LABEL} text-red-600`}>Critical &lt;</label>
            <div className="flex items-center gap-1">
              <input type="number" min="0" max="100" value={thresholds.critical} onChange={e => setThreshold('critical', e.target.value)} className={INPUT} />
              <span className="text-xs text-gray-400">pts</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Must be in descending order: Healthy &gt; At Risk &gt; Critical.</p>
      </section>

      {/* Stale Days + Model Version */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Other Settings</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Stale Days</label>
            <div className="flex items-center gap-2">
              <input type="number" min="1" value={staleDays} onChange={e => setStaleDays(e.target.value)} className={INPUT} />
              <span className="text-xs text-gray-400">days</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Days without a note before engagement score drops.</p>
          </div>
          <div>
            <label className={LABEL}>Score Model Version</label>
            <input type="text" value={modelVersion} onChange={e => setModelVersion(e.target.value)} placeholder="phi-1" className={INPUT} />
            <p className="text-xs text-gray-400 mt-1">Change this to force a full recalculation for all partners.</p>
          </div>
        </div>
      </section>

      {/* Save Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600">Saved ✓</span>}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !weightsValid}
          className="bg-brand-700 text-white text-sm px-5 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Configuration'}
        </button>
      </div>

      {/* Danger Zone */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 mt-8">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Recalculate All Scores</h2>
        <p className="text-xs text-gray-500 mb-4">
          Recomputes health scores for all non-churned partners using the current configuration.
          This runs synchronously and may take a moment for large partner portfolios.
        </p>
        <div className="flex items-center gap-4">
          <button
            onClick={handleRecalculate}
            disabled={recalcing}
            className="border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {recalcing ? 'Recalculating…' : 'Recalculate All Partner Scores'}
          </button>
          {recalcResult && <span className="text-sm text-gray-600">{recalcResult}</span>}
        </div>
      </section>
    </div>
  )
}
