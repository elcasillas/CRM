'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_CHECKS, type InspectionCheckDef } from '@/lib/deal-inspect'

const SEVERITY_OPTIONS = ['critical', 'medium', 'low'] as const
const SEVERITY_LABELS: Record<string, string> = { critical: 'Critical', medium: 'Medium', low: 'Low' }
const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-600 bg-red-50 ring-red-200',
  medium:   'text-amber-600 bg-amber-50 ring-amber-200',
  low:      'text-gray-500 bg-gray-50 ring-gray-200',
}

export default function InspectionConfigClient() {
  const [configId, setConfigId] = useState<string | null>(null)
  const [checks, setChecks]     = useState<InspectionCheckDef[]>(DEFAULT_CHECKS)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/inspection-config')
      .then(r => r.json())
      .then(data => {
        if (data.id) setConfigId(data.id)
        if (Array.isArray(data.checks) && data.checks.length > 0) {
          setChecks(data.checks)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function updateCheck(id: string, field: 'severity' | 'enabled', value: string | boolean) {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
    setSaveMsg(null)
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    const res = await fetch('/api/admin/inspection-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: configId, checks }),
    })
    const body = await res.json()
    setSaveMsg(res.ok ? { type: 'ok', text: 'Settings saved.' } : { type: 'err', text: body.error ?? 'Save failed.' })
    setSaving(false)
  }

  const enabledCount = checks.filter(c => c.enabled).length

  if (loading) return <div className="max-w-3xl mx-auto px-6 py-8 text-sm text-gray-400">Loading…</div>

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Deal Inspection Settings</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure which of the 15 inspection points are active and their severity. Disabled checks are skipped when Email Owner inspects a deal.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Inspection checks</span>
          <span className="text-xs text-gray-400">{enabledCount} of {checks.length} active</span>
        </div>

        <div className="divide-y divide-gray-100">
          {checks.map((check, i) => (
            <div key={check.id} className={`flex items-center gap-4 px-5 py-3 ${check.enabled ? '' : 'opacity-50'}`}>
              <span className="text-xs text-gray-400 w-5 shrink-0 text-right">{i + 1}</span>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">{check.label}</p>
              </div>

              {/* Severity selector */}
              <select
                value={check.severity}
                onChange={e => updateCheck(check.id, 'severity', e.target.value)}
                disabled={!check.enabled}
                className={`text-xs font-medium px-2 py-1 rounded-full ring-1 border-0 focus:outline-none focus:ring-2 ${SEVERITY_COLORS[check.severity] ?? ''}`}
              >
                {SEVERITY_OPTIONS.map(s => (
                  <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
                ))}
              </select>

              {/* Enable toggle */}
              <button
                onClick={() => updateCheck(check.id, 'enabled', !check.enabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${check.enabled ? 'bg-brand-500' : 'bg-gray-200'}`}
                role="switch"
                aria-checked={check.enabled}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${check.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>

        {saveMsg && (
          <span className={`text-sm font-medium ${saveMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
            {saveMsg.text}
          </span>
        )}
      </div>
    </div>
  )
}
