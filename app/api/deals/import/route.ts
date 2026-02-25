import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── CSV parsing (ported from DealUpdates/js/ingest.js) ────────────────────────

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
    } else {
      numeric = numeric.replace(/,/g, '')
    }
  }
  let amount = parseFloat(numeric) || 0
  if (isNegative && amount > 0) amount = -amount
  return { value: amount, isCAD: true }
}

function normalizeString(s: string) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

interface ParsedDeal {
  deal_name: string
  deal_owner_name: string
  stage_name: string
  value_amount: number
  close_date: string | null
  deal_notes: string
  deal_description: string
}

function parseCSVDeals(csvText: string): ParsedDeal[] {
  if (csvText.charCodeAt(0) === 0xFEFF) csvText = csvText.slice(1)

  const allRows = parseCSVText(csvText)
  if (allRows.length === 0) return []

  let headerRowIndex = -1
  let headers: string[] = []
  for (let i = 0; i < Math.min(allRows.length, 20); i++) {
    if (allRows[i].includes('Deal Owner') && allRows[i].includes('Deal Name')) {
      headerRowIndex = i; headers = allRows[i]; break
    }
  }
  if (headerRowIndex === -1) throw new Error('Could not find header row with "Deal Owner" and "Deal Name" columns')

  const idx = (col: string) => headers.indexOf(col)
  const iDealOwner = idx('Deal Owner')
  const iDealName  = idx('Deal Name')
  const iStage     = idx('Stage')
  const iACV       = idx('Annual Contract Value')
  const iClose     = idx('Closing Date')
  const iNotes     = idx('Note Content')
  const iDesc      = idx('Description')

  // Collect rows per deal (dedup by normalized name)
  const dealMap = new Map<string, ParsedDeal & { notesSet: Set<string> }>()

  for (let i = headerRowIndex + 1; i < allRows.length; i++) {
    const row = allRows[i]
    if (row.length < 2 || !row.join('').trim()) continue

    const dealName = (row[iDealName] ?? '').trim()
    if (!dealName) continue

    const dealOwner = (row[iDealOwner] ?? '').trim()
    if (!dealOwner || dealOwner.length > 100 || dealOwner.split(' ').length > 5) continue

    const acvRaw = iACV >= 0 ? (row[iACV] ?? '') : ''
    const acv = parseACV(acvRaw)
    if (!acv.isCAD) continue

    const stageName  = iStage >= 0 ? (row[iStage] ?? '').trim() : ''
    const closeRaw   = iClose >= 0 ? (row[iClose] ?? '').trim() : ''
    const noteRaw    = iNotes >= 0 ? (row[iNotes] ?? '').trim() : ''
    const descRaw    = iDesc  >= 0 ? (row[iDesc]  ?? '').trim() : ''

    // Strip HTML from notes
    const noteText = noteRaw.replace(/<[^>]*>/g, '')

    const key = normalizeString(dealName)
    const existing = dealMap.get(key)
    if (existing) {
      if (noteText) existing.notesSet.add(noteText)
    } else {
      let closeDate: string | null = null
      if (closeRaw) {
        const d = new Date(closeRaw)
        if (!isNaN(d.getTime())) closeDate = d.toISOString().split('T')[0]
      }
      const notesSet = new Set<string>()
      if (noteText) notesSet.add(noteText)
      dealMap.set(key, {
        deal_name:       dealName,
        deal_owner_name: dealOwner,
        stage_name:      stageName,
        value_amount:    acv.value,
        close_date:      closeDate,
        deal_notes:      '',
        deal_description: descRaw,
        notesSet,
      })
    }
  }

  return Array.from(dealMap.values()).map(({ notesSet, ...d }) => ({
    ...d,
    deal_notes: [...notesSet].join('\n\n'),
  }))
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const accountId = formData.get('account_id') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!accountId) return NextResponse.json({ error: 'account_id is required' }, { status: 400 })

  const csvText = await file.text()
  let parsedDeals: ParsedDeal[]
  try {
    parsedDeals = parseCSVDeals(csvText)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }

  if (parsedDeals.length === 0) {
    return NextResponse.json({ error: 'No valid CAD deals found in CSV' }, { status: 422 })
  }

  const admin = createAdminClient()

  // Resolve stages and profiles for matching
  const [{ data: stages }, { data: profiles }] = await Promise.all([
    admin.from('deal_stages').select('id, stage_name, sort_order, is_closed').order('sort_order'),
    admin.from('profiles').select('id, full_name'),
  ])

  const stageMap = new Map((stages ?? []).map((s: { id: string; stage_name: string }) =>
    [normalizeString(s.stage_name), s.id]
  ))
  const profileMap = new Map((profiles ?? []).map((p: { id: string; full_name: string | null }) =>
    [normalizeString(p.full_name ?? ''), p.id]
  ))
  const defaultStageId = (stages ?? []).find((s: { is_closed: boolean }) => !s.is_closed)?.id

  const now = new Date().toISOString()
  const rows = parsedDeals.map(d => {
    const stageId   = stageMap.get(normalizeString(d.stage_name)) ?? defaultStageId
    const ownerId   = profileMap.get(normalizeString(d.deal_owner_name)) ?? user.id
    return {
      account_id:      accountId,
      stage_id:        stageId,
      deal_name:       d.deal_name,
      deal_description: d.deal_description || null,
      deal_notes:      d.deal_notes || null,
      deal_owner_id:   ownerId,
      value_amount:    d.value_amount > 0 ? d.value_amount : null,
      currency:        'CAD',
      close_date:      d.close_date,
      last_activity_at: now,
    }
  }).filter(r => r.stage_id)  // skip rows with no resolvable stage

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No deals could be matched to a valid stage' }, { status: 422 })
  }

  const { data: inserted, error: insertErr } = await admin
    .from('deals')
    .insert(rows)
    .select('id')
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Trigger health score computation for each inserted deal (fire-and-forget)
  const origin = req.nextUrl.origin
  for (const { id } of inserted ?? []) {
    fetch(`${origin}/api/deals/${id}/health-score`, {
      method: 'POST',
      headers: { cookie: req.headers.get('cookie') ?? '' },
    }).catch(() => { /* silent */ })
  }

  return NextResponse.json({
    inserted: inserted?.length ?? 0,
    skipped:  parsedDeals.length - rows.length,
  })
}
