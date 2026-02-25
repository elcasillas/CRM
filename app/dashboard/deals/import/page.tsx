'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

// ── Client-side CSV parsing (same logic as API route) ────────────────────────

function parseCSVText(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]; const nextChar = text[i + 1]
    if (inQuotes) {
      if (char === '"') { if (nextChar === '"') { currentField += '"'; i++ } else inQuotes = false }
      else currentField += char
    } else {
      if (char === '"') { inQuotes = true }
      else if (char === ',') { currentRow.push(currentField); currentField = '' }
      else if (char === '\r') { if (nextChar === '\n') i++; currentRow.push(currentField); rows.push(currentRow); currentRow = []; currentField = '' }
      else if (char === '\n') { currentRow.push(currentField); rows.push(currentRow); currentRow = []; currentField = '' }
      else currentField += char
    }
  }
  if (currentField || currentRow.length > 0) { currentRow.push(currentField); rows.push(currentRow) }
  return rows
}

function parseACV(value: string): { value: number; isCAD: boolean } {
  if (!value) return { value: 0, isCAD: true }
  const upper = value.trim().toUpperCase()
  if (upper.includes('USD') || /^US\$/.test(upper)) return { value: 0, isCAD: false }
  if (upper.includes('EUR') || /^€/.test(upper.replace(/\s/g, ''))) return { value: 0, isCAD: false }
  const isNegative = /\(.*\)/.test(upper)
  let numeric = upper.replace(/[^0-9.,-]/g, '')
  if (numeric.includes(',')) {
    const commaCount = (numeric.match(/,/g) || []).length
    const lastComma = numeric.lastIndexOf(',')
    const digitsAfterComma = numeric.length - lastComma - 1
    if (commaCount === 1 && digitsAfterComma <= 2 && lastComma > numeric.lastIndexOf('.')) {
      numeric = numeric.replace(/\./g, '').replace(',', '.')
    } else { numeric = numeric.replace(/,/g, '') }
  }
  let amount = parseFloat(numeric) || 0
  if (isNegative && amount > 0) amount = -amount
  return { value: amount, isCAD: true }
}

function normalize(s: string) { return (s || '').trim().toLowerCase().replace(/\s+/g, ' ') }

interface PreviewRow {
  deal_name:  string
  owner:      string
  stage:      string
  acv:        number
  close_date: string
  notes_len:  number
}

function previewCSV(csvText: string): PreviewRow[] | string {
  if (csvText.charCodeAt(0) === 0xFEFF) csvText = csvText.slice(1)
  const allRows = parseCSVText(csvText)
  let headerIdx = -1; let headers: string[] = []
  for (let i = 0; i < Math.min(allRows.length, 20); i++) {
    if (allRows[i].includes('Deal Owner') && allRows[i].includes('Deal Name')) {
      headerIdx = i; headers = allRows[i]; break
    }
  }
  if (headerIdx === -1) return 'Could not find header row with "Deal Owner" and "Deal Name" columns'
  const idx = (col: string) => headers.indexOf(col)
  const iOwner = idx('Deal Owner'); const iName = idx('Deal Name')
  const iStage = idx('Stage'); const iACV = idx('Annual Contract Value')
  const iClose = idx('Closing Date'); const iNotes = idx('Note Content')
  const dealMap = new Map<string, PreviewRow & { notesLen: number }>()
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const row = allRows[i]
    if (!row.join('').trim()) continue
    const name = (row[iName] ?? '').trim(); if (!name) continue
    const owner = (row[iOwner] ?? '').trim()
    if (!owner || owner.length > 100 || owner.split(' ').length > 5) continue
    const acv = parseACV(iACV >= 0 ? (row[iACV] ?? '') : '')
    if (!acv.isCAD) continue
    const stage = iStage >= 0 ? (row[iStage] ?? '').trim() : ''
    const closeRaw = iClose >= 0 ? (row[iClose] ?? '').trim() : ''
    const noteLen = iNotes >= 0 ? (row[iNotes] ?? '').replace(/<[^>]*>/g, '').trim().length : 0
    const key = normalize(name)
    const ex = dealMap.get(key)
    if (ex) { ex.notesLen += noteLen }
    else {
      let closeDate = ''
      if (closeRaw) { const d = new Date(closeRaw); if (!isNaN(d.getTime())) closeDate = d.toISOString().split('T')[0] }
      dealMap.set(key, { deal_name: name, owner, stage, acv: acv.value, close_date: closeDate, notes_len: noteLen, notesLen: noteLen })
    }
  }
  return Array.from(dealMap.values()).map(({ notesLen, ...r }) => ({ ...r, notes_len: notesLen }))
}

function fmtCurrency(v: number) {
  if (!v) return '—'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${v.toFixed(0)}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImportDealsPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver]     = useState(false)
  const [csvFile, setCsvFile]       = useState<File | null>(null)
  const [preview, setPreview]       = useState<PreviewRow[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [accounts, setAccounts]     = useState<{ id: string; account_name: string }[]>([])
  const [accountId, setAccountId]   = useState('')
  const [importing, setImporting]   = useState(false)
  const [result, setResult]         = useState<{ inserted: number; skipped: number } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('accounts').select('id, account_name').order('account_name').then(({ data }) => {
      setAccounts(data ?? [])
    })
  }, [])

  const processFile = useCallback((file: File) => {
    setCsvFile(file); setPreview(null); setParseError(null); setResult(null); setImportError(null)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const res = previewCSV(text)
      if (typeof res === 'string') setParseError(res)
      else setPreview(res)
    }
    reader.readAsText(file)
  }, [])

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  async function handleImport() {
    if (!csvFile || !accountId) return
    setImporting(true); setImportError(null)
    const fd = new FormData()
    fd.append('file', csvFile)
    fd.append('account_id', accountId)
    const res = await fetch('/api/deals/import', { method: 'POST', body: fd })
    const body = await res.json()
    if (!res.ok) { setImportError(body.error ?? 'Import failed'); setImporting(false); return }
    setResult(body)
    setImporting(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
        <h2 className="text-xl font-semibold text-gray-900">Import deals from CSV</h2>
      </div>

      {result ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-green-800 font-semibold text-lg">{result.inserted} deal{result.inserted !== 1 ? 's' : ''} imported</p>
          {result.skipped > 0 && <p className="text-green-700 text-sm mt-1">{result.skipped} row{result.skipped !== 1 ? 's' : ''} skipped (non-CAD or invalid)</p>}
          <p className="text-green-600 text-sm mt-1">Health scores are being computed in the background.</p>
          <button
            onClick={() => router.push('/dashboard/deals')}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Go to Deals
          </button>
        </div>
      ) : (
        <>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-white'}`}
          >
            <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
            <p className="text-gray-500 text-sm">
              {csvFile ? <span className="font-medium text-gray-800">{csvFile.name}</span> : 'Drop a CSV file here or click to browse'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Expects columns: Deal Owner, Deal Name, Stage, Annual Contract Value, Closing Date, Note Content</p>
          </div>

          {parseError && <p className="mt-3 text-red-600 text-sm font-medium">{parseError}</p>}

          {preview && (
            <>
              <div className="mt-4 flex items-center gap-3">
                <p className="text-sm text-gray-700 font-medium">{preview.length} deal{preview.length !== 1 ? 's' : ''} found</p>
                <span className="text-xs text-gray-400">(CAD only, deduplicated by name)</span>
              </div>

              {/* Account selector */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Target account *</label>
                <select
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm"
                >
                  <option value="">— select account —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">All imported deals will be linked to this account. Deal owners are matched by name to existing profiles; unmatched owners are assigned to you.</p>
              </div>

              {/* Preview table */}
              <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Deal name</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Owner</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Stage</th>
                        <th className="px-3 py-2.5 text-right font-medium text-gray-500">ACV</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Close</th>
                        <th className="px-3 py-2.5 text-right font-medium text-gray-500">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900 max-w-[200px] truncate">{row.deal_name}</td>
                          <td className="px-3 py-2 text-gray-600">{row.owner}</td>
                          <td className="px-3 py-2 text-gray-500">{row.stage || '—'}</td>
                          <td className="px-3 py-2 text-gray-700 font-medium text-right">{fmtCurrency(row.acv)}</td>
                          <td className="px-3 py-2 text-gray-500">{row.close_date || '—'}</td>
                          <td className="px-3 py-2 text-gray-400 text-right">{row.notes_len > 0 ? `${row.notes_len}c` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {importError && <p className="mt-3 text-red-600 text-sm font-medium">{importError}</p>}

              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleImport}
                  disabled={importing || !accountId}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
                >
                  {importing ? 'Importing…' : `Import ${preview.length} deal${preview.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
