import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── RFC 4180 CSV parser ───────────────────────────────────────────────────────

function parseCSVText(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') { currentField += '"'; i++ }
        else inQuotes = false
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        currentRow.push(currentField); currentField = ''
      } else if (char === '\r') {
        if (nextChar === '\n') i++
        currentRow.push(currentField); rows.push(currentRow)
        currentRow = []; currentField = ''
      } else if (char === '\n') {
        currentRow.push(currentField); rows.push(currentRow)
        currentRow = []; currentField = ''
      } else {
        currentField += char
      }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField); rows.push(currentRow)
  }
  return rows
}

// ── Allowed product categories ────────────────────────────────────────────────

const PRODUCT_CATEGORIES = new Set([
  'Website DIY', 'Website DIFM', 'Email ISP', 'Email Business',
  'Domain', 'Email Marketing', 'Fax Online', 'Logo DIFM',
  'Marketing Online', 'SSL', 'Support', 'Pro Serve', 'Other',
])

// ── POST /api/products/import ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Parse multipart form data
  let file: File | null = null
  try {
    const formData = await req.formData()
    file = formData.get('file') as File | null
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const text = await file.text()
  const rows = parseCSVText(text)
  if (rows.length < 2) return NextResponse.json({ error: 'CSV is empty or has no data rows' }, { status: 400 })

  // ── Detect header row (within first 20 rows) ─────────────────────────────────
  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const lower = rows[i].map(c => c.toLowerCase().trim())
    if (lower.includes('product name')) { headerIdx = i; break }
  }
  if (headerIdx === -1) return NextResponse.json({ error: 'Could not find "Product Name" header column' }, { status: 400 })

  const headers = rows[headerIdx].map(c => c.trim())
  function idx(label: string) {
    return headers.findIndex(h => h.toLowerCase() === label.toLowerCase())
  }

  const iName  = idx('Product Name')
  const iPrice = idx('Unit Price')
  const iCode  = idx('Product Code')
  const iCat   = idx('Product Category')

  if (iName === -1) return NextResponse.json({ error: 'Missing required column: Product Name' }, { status: 400 })

  // ── Load existing product names for deduplication ────────────────────────────
  const admin = createAdminClient()
  const { data: existing } = await admin.from('products').select('product_name')
  const existingNames = new Set(
    (existing ?? []).map(p => p.product_name.trim().toLowerCase())
  )

  // ── Parse and insert rows ────────────────────────────────────────────────────
  let inserted = 0
  let existingCount = 0
  let skipped = 0

  const dataRows = rows.slice(headerIdx + 1)

  for (const row of dataRows) {
    // Skip completely empty rows
    if (row.every(c => !c.trim())) continue

    const product_name = (row[iName] ?? '').trim()
    if (!product_name) { skipped++; continue }

    // Dedup by normalized name
    const normalizedName = product_name.toLowerCase()
    if (existingNames.has(normalizedName)) { existingCount++; continue }

    const unit_price = iPrice >= 0
      ? (parseFloat((row[iPrice] ?? '').replace(/[$,\s]/g, '')) || 0)
      : 0
    const product_code = iCode >= 0 ? ((row[iCode] ?? '').trim() || null) : null
    const rawCat       = iCat  >= 0 ? (row[iCat] ?? '').trim() : ''
    const product_category = PRODUCT_CATEGORIES.has(rawCat) ? rawCat : null

    const { error } = await admin.from('products').insert({ product_name, unit_price, product_code, product_category })
    if (error) { skipped++; continue }

    existingNames.add(normalizedName)
    inserted++
  }

  return NextResponse.json({ inserted, existing: existingCount, skipped })
}
