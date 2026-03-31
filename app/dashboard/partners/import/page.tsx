'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CsvDropzone } from '@/components/csv-dropzone'

// ── Client-side CSV preview (same pattern as deals/import) ────────────────────

function parseCSVText(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]; const next = text[i + 1]
    if (inQuotes) {
      if (char === '"') { if (next === '"') { currentField += '"'; i++ } else inQuotes = false }
      else currentField += char
    } else {
      if (char === '"') { inQuotes = true }
      else if (char === ',') { currentRow.push(currentField); currentField = '' }
      else if (char === '\r') { if (next === '\n') i++; currentRow.push(currentField); rows.push(currentRow); currentRow = []; currentField = '' }
      else if (char === '\n') { currentRow.push(currentField); rows.push(currentRow); currentRow = []; currentField = '' }
      else currentField += char
    }
  }
  if (currentField || currentRow.length > 0) { currentRow.push(currentField); rows.push(currentRow) }
  return rows.filter(r => r.some(c => c.trim()))
}

function normalise(s: string) { return (s || '').trim().toLowerCase().replace(/\s+/g, '_') }

interface PreviewRow {
  partner_name: string
  owner:        string
  region:       string
  as_of_date:   string
  mrr:          string
  health_override: string
  notes_len:    number
}

function previewCSV(csvText: string): PreviewRow[] | string {
  if (csvText.charCodeAt(0) === 0xFEFF) csvText = csvText.slice(1)
  const allRows = parseCSVText(csvText)

  let headerIdx = -1
  for (let i = 0; i < Math.min(allRows.length, 5); i++) {
    const lower = allRows[i].map(c => c.trim().toLowerCase())
    if (lower.includes('partner_name') || lower.includes('partner_id')) { headerIdx = i; break }
  }
  if (headerIdx === -1) return 'Could not find header row. Expected columns: partner_name (or partner_id) and as_of_date.'

  const headers = allRows[headerIdx].map(h => normalise(h))
  const col     = (name: string) => headers.indexOf(name)
  const get     = (row: string[], name: string) => (row[col(name)] ?? '').trim()

  const results: PreviewRow[] = []
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const row = allRows[i]
    if (!row.join('').trim()) continue
    const partnerName = get(row, 'partner_name') || get(row, 'partner_id')
    if (!partnerName) continue
    results.push({
      partner_name:    partnerName,
      owner:           get(row, 'owner_name'),
      region:          get(row, 'region'),
      as_of_date:      get(row, 'as_of_date'),
      mrr:             get(row, 'mrr'),
      health_override: get(row, 'health_score_override'),
      notes_len:       get(row, 'notes').length,
    })
  }
  return results
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImportPartnersPage() {
  const router = useRouter()

  const [csvFile,      setCsvFile]      = useState<File | null>(null)
  const [preview,      setPreview]      = useState<PreviewRow[] | null>(null)
  const [parseError,   setParseError]   = useState<string | null>(null)
  const [importing,    setImporting]    = useState(false)
  const [result,       setResult]       = useState<{ imported: number; updated: number; skipped: number; errors: string[] } | null>(null)
  const [importError,  setImportError]  = useState<string | null>(null)

  const processFile = useCallback((file: File) => {
    setCsvFile(file); setPreview(null); setParseError(null); setResult(null); setImportError(null)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const res  = previewCSV(text)
      if (typeof res === 'string') setParseError(res)
      else setPreview(res)
    }
    reader.readAsText(file)
  }, [])

  async function handleImport() {
    if (!csvFile) return
    setImporting(true); setImportError(null)
    const fd = new FormData()
    fd.append('file', csvFile)
    const res  = await fetch('/api/partners/import', { method: 'POST', body: fd })
    const body = await res.json()
    if (!res.ok) { setImportError(body.error ?? 'Import failed'); setImporting(false); return }
    setResult(body)
    setImporting(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
        <h2 className="text-xl font-semibold text-gray-900">Import Partner Health Data</h2>
        <a
          href="/api/partners/import/template"
          className="ml-auto text-sm text-[#00ADB1] hover:text-[#00989C] font-medium border border-[#33C3C7] px-3 py-1.5 rounded-lg transition-colors"
        >
          Download Template
        </a>
      </div>

      {result ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-green-800 font-semibold text-lg">
            {result.imported > 0 && `${result.imported} partner${result.imported !== 1 ? 's' : ''} created`}
            {result.imported > 0 && result.updated > 0 && ', '}
            {result.updated > 0 && `${result.updated} partner${result.updated !== 1 ? 's' : ''} updated`}
          </p>
          {result.skipped > 0 && (
            <p className="text-green-700 text-sm mt-1">{result.skipped} row{result.skipped !== 1 ? 's' : ''} skipped (missing partner name or invalid date)</p>
          )}
          {result.errors.length > 0 && (
            <div className="mt-3 text-left bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-medium text-amber-700 mb-1">Errors ({result.errors.length}):</p>
              {result.errors.map((e, i) => <p key={i} className="text-xs text-amber-600">{e}</p>)}
            </div>
          )}
          <p className="text-green-600 text-sm mt-2">Health scores are being recalculated in the background.</p>
          <button
            onClick={() => router.push('/dashboard/partners')}
            className="mt-4 bg-[#00ADB1] hover:bg-[#00989C] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            View Partner Health Dashboard
          </button>
        </div>
      ) : (
        <>
          <CsvDropzone
            onFile={processFile}
            uploadState={parseError ? 'error' : 'idle'}
            statusMessage={parseError ?? undefined}
            fileName={csvFile?.name}
            instructions="Expects columns: partner_name, as_of_date, plus optional metric and engagement fields. Download the template for the full column list."
            onReset={parseError ? () => { setCsvFile(null); setParseError(null) } : undefined}
          />

          {preview && (
            <>
              <div className="mt-4 flex items-center gap-3">
                <p className="text-sm text-gray-700 font-medium">
                  {preview.length} partner row{preview.length !== 1 ? 's' : ''} found
                </p>
                <span className="text-xs text-gray-400">(deduplicated by partner name)</span>
              </div>

              {/* Preview table */}
              <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Partner Name</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Owner</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Region</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">As-of Date</th>
                        <th className="px-3 py-2.5 text-right font-medium text-gray-500">MRR</th>
                        <th className="px-3 py-2.5 text-right font-medium text-gray-500">Score Override</th>
                        <th className="px-3 py-2.5 text-right font-medium text-gray-500">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900 max-w-[200px] truncate">{row.partner_name}</td>
                          <td className="px-3 py-2 text-gray-600">{row.owner || '—'}</td>
                          <td className="px-3 py-2 text-gray-500">{row.region || '—'}</td>
                          <td className="px-3 py-2 text-gray-500">{row.as_of_date || '—'}</td>
                          <td className="px-3 py-2 text-gray-700 font-medium text-right">{row.mrr ? `$${Number(row.mrr).toLocaleString()}` : '—'}</td>
                          <td className="px-3 py-2 text-gray-500 text-right">{row.health_override || '—'}</td>
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
                  disabled={importing}
                  className="bg-[#00ADB1] hover:bg-[#00989C] disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
                >
                  {importing ? 'Importing…' : `Import ${preview.length} row${preview.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
