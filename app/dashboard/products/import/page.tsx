'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CsvDropzone } from '@/components/csv-dropzone'

// ── RFC 4180 CSV parser ────────────────────────────────────────────────────────

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

// ── Client-side preview parse ──────────────────────────────────────────────────

const PRODUCT_CATEGORIES = new Set([
  'Website DIY', 'Website DIFM', 'Email ISP', 'Email Business',
  'Domain', 'Email Marketing', 'Fax Online', 'Logo DIFM',
  'Marketing Online', 'SSL', 'Support', 'Pro Serve', 'Other',
])

interface PreviewRow {
  product_name:     string
  unit_price:       number
  product_code:     string
  product_category: string
}

function previewCSV(csvText: string): PreviewRow[] | string {
  const allRows = parseCSVText(csvText)
  let headerIdx = -1
  for (let i = 0; i < Math.min(allRows.length, 20); i++) {
    if (allRows[i].map(c => c.toLowerCase().trim()).includes('product name')) {
      headerIdx = i; break
    }
  }
  if (headerIdx === -1) return 'Could not find "Product Name" header column'

  const headers = allRows[headerIdx].map(c => c.trim())
  const idx = (label: string) => headers.findIndex(h => h.toLowerCase() === label.toLowerCase())
  const iName  = idx('Product Name')
  const iPrice = idx('Unit Price')
  const iCode  = idx('Product Code')
  const iCat   = idx('Product Category')
  if (iName === -1) return 'Missing required column: Product Name'

  const seen = new Set<string>()
  const rows: PreviewRow[] = []
  for (const row of allRows.slice(headerIdx + 1)) {
    if (row.every(c => !c.trim())) continue
    const product_name = (row[iName] ?? '').trim()
    if (!product_name) continue
    const key = product_name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const unit_price     = iPrice >= 0 ? (parseFloat((row[iPrice] ?? '').replace(/[$,\s]/g, '')) || 0) : 0
    const product_code   = iCode >= 0 ? (row[iCode] ?? '').trim() : ''
    const rawCat         = iCat  >= 0 ? (row[iCat]  ?? '').trim() : ''
    const product_category = PRODUCT_CATEGORIES.has(rawCat) ? rawCat : ''
    rows.push({ product_name, unit_price, product_code, product_category })
  }
  return rows
}

function fmtCurrency(v: number) {
  if (!v) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v)
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ImportProductsPage() {
  const router = useRouter()
  const [csvFile,      setCsvFile]      = useState<File | null>(null)
  const [preview,      setPreview]      = useState<PreviewRow[] | null>(null)
  const [parseError,   setParseError]   = useState<string | null>(null)
  const [importing,    setImporting]    = useState(false)
  const [result,       setResult]       = useState<{ inserted: number; existing: number; skipped: number } | null>(null)
  const [importError,  setImportError]  = useState<string | null>(null)

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

  async function handleImport() {
    if (!csvFile) return
    setImporting(true); setImportError(null)
    const fd = new FormData()
    fd.append('file', csvFile)
    const res  = await fetch('/api/products/import', { method: 'POST', body: fd })
    const body = await res.json()
    if (!res.ok) { setImportError(body.error ?? 'Import failed'); setImporting(false); return }
    setResult(body)
    setImporting(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
        <h2 className="text-xl font-semibold text-gray-900">Import products from CSV</h2>
      </div>

      {result ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-green-800 font-semibold text-lg">{result.inserted} product{result.inserted !== 1 ? 's' : ''} imported</p>
          {result.existing > 0 && <p className="text-green-700 text-sm mt-1">{result.existing} already existed and were skipped</p>}
          {result.skipped  > 0 && <p className="text-green-700 text-sm mt-1">{result.skipped} row{result.skipped !== 1 ? 's' : ''} skipped (invalid or empty)</p>}
          <button
            onClick={() => router.push('/dashboard/products')}
            className="mt-4 bg-[#00ADB1] hover:bg-[#00989C] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Go to Products
          </button>
        </div>
      ) : (
        <>
          <CsvDropzone
            onFile={processFile}
            uploadState={parseError ? 'error' : 'idle'}
            statusMessage={parseError ?? undefined}
            fileName={csvFile?.name}
            instructions="Expects columns: Product Name, Unit Price, Product Code, Product Category"
            onReset={parseError ? () => { setCsvFile(null); setParseError(null) } : undefined}
          />

          {preview && (
            <>
              <div className="mt-4 flex items-center gap-3">
                <p className="text-sm text-gray-700 font-medium">{preview.length} product{preview.length !== 1 ? 's' : ''} found</p>
                <span className="text-xs text-gray-400">(deduplicated by name)</span>
              </div>

              <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Product name</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Product code</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Category</th>
                        <th className="px-3 py-2.5 text-right font-medium text-gray-500">Unit price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900 max-w-[300px] truncate">{row.product_name}</td>
                          <td className="px-3 py-2 text-gray-500">{row.product_code || '—'}</td>
                          <td className="px-3 py-2 text-gray-500">{row.product_category || '—'}</td>
                          <td className="px-3 py-2 text-gray-700 font-medium text-right">{fmtCurrency(row.unit_price)}</td>
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
                  {importing ? 'Importing…' : `Import ${preview.length} product${preview.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
