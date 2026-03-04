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

interface ParsedNote {
  text: string
  modified_at: string | null  // ISO timestamp parsed from "Modified Time" column
}

interface ParsedDeal {
  deal_name: string
  deal_owner_name: string
  stage_name: string
  value_amount: number
  close_date: string | null
  deal_description: string
  account_name: string
  notes: ParsedNote[]
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
  const iDealOwner    = idx('Deal Owner')
  const iDealName     = idx('Deal Name')
  const iAcctName     = idx('Account Name')
  const iStage        = idx('Stage')
  const iACV          = idx('Annual Contract Value')
  const iClose        = idx('Closing Date')
  const iNotes        = idx('Note Content')
  const iDesc         = idx('Description')
  const iModifiedTime = idx('Modified Time (Notes)')

  // Collect rows per deal; notes deduped by text within the CSV
  const dealMap = new Map<string, ParsedDeal & { noteMap: Map<string, ParsedNote> }>()

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

    const acctName    = iAcctName >= 0 ? (row[iAcctName] ?? '').trim() : ''
    const stageName   = iStage    >= 0 ? (row[iStage]    ?? '').trim() : ''
    const closeRaw    = iClose    >= 0 ? (row[iClose]    ?? '').trim() : ''
    const noteRaw     = iNotes    >= 0 ? (row[iNotes]    ?? '').trim() : ''
    const descRaw     = iDesc     >= 0 ? (row[iDesc]     ?? '').trim() : ''
    const modifiedRaw = iModifiedTime >= 0 ? (row[iModifiedTime] ?? '').trim() : ''

    const noteText = noteRaw.replace(/<[^>]*>/g, '').trim()

    let modifiedAt: string | null = null
    if (modifiedRaw) {
      const d = new Date(modifiedRaw)
      if (!isNaN(d.getTime())) modifiedAt = d.toISOString()
    }

    const key = normalizeString(dealName)
    const existing = dealMap.get(key)
    if (existing) {
      if (noteText && !existing.noteMap.has(noteText)) {
        existing.noteMap.set(noteText, { text: noteText, modified_at: modifiedAt })
      }
    } else {
      let closeDate: string | null = null
      if (closeRaw) {
        const d = new Date(closeRaw)
        if (!isNaN(d.getTime())) closeDate = d.toISOString().split('T')[0]
      }
      const noteMap = new Map<string, ParsedNote>()
      if (noteText) noteMap.set(noteText, { text: noteText, modified_at: modifiedAt })
      dealMap.set(key, {
        deal_name:        dealName,
        deal_owner_name:  dealOwner,
        account_name:     acctName,
        stage_name:       stageName,
        value_amount:     acv.value,
        close_date:       closeDate,
        deal_description: descRaw,
        notes:            [],
        noteMap,
      })
    }
  }

  return Array.from(dealMap.values()).map(({ noteMap, ...d }) => ({
    ...d,
    notes: [...noteMap.values()],
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

  // Resolve stages, profiles, and accounts for matching
  const [{ data: stages }, { data: profiles }, { data: existingAccounts }] = await Promise.all([
    admin.from('deal_stages').select('id, stage_name, sort_order, is_closed').order('sort_order'),
    admin.from('profiles').select('id, full_name'),
    admin.from('accounts').select('id, account_name'),
  ])

  const stageMap = new Map((stages ?? []).map((s: { id: string; stage_name: string }) =>
    [normalizeString(s.stage_name), s.id]
  ))
  const profileMap = new Map((profiles ?? []).map((p: { id: string; full_name: string | null }) =>
    [normalizeString(p.full_name ?? ''), p.id]
  ))
  const defaultStageId = (stages ?? []).find((s: { is_closed: boolean }) => !s.is_closed)?.id

  // Build account name → id map; auto-create accounts not yet in the DB
  const accountNameMap = new Map<string, string>(
    (existingAccounts ?? []).map((a: { id: string; account_name: string }) =>
      [normalizeString(a.account_name), a.id]
    )
  )
  const missingNames = [...new Set(
    parsedDeals
      .map(d => d.account_name)
      .filter(n => n && !accountNameMap.has(normalizeString(n)))
  )]
  if (missingNames.length > 0) {
    const { data: newAccounts } = await admin
      .from('accounts')
      .insert(missingNames.map(name => ({
        account_name:     name,
        account_owner_id: user.id,
        status:           'active',
      })))
      .select('id, account_name')
    for (const a of newAccounts ?? []) {
      accountNameMap.set(normalizeString(a.account_name), a.id)
    }
  }

  const now = new Date().toISOString()
  type DealRow = { account_id: string; stage_id: string; deal_name: string; deal_description: string | null; deal_owner_id: string; value_amount: number | null; currency: string; close_date: string | null; last_activity_at: string; _notes: ParsedNote[]; _owner_id: string }
  const rows = parsedDeals.map(d => {
    const resolvedAccountId =
      (d.account_name && accountNameMap.get(normalizeString(d.account_name))) ||
      accountId ||
      null
    if (!resolvedAccountId) return null
    const stageId = stageMap.get(normalizeString(d.stage_name)) ?? defaultStageId
    const ownerId = profileMap.get(normalizeString(d.deal_owner_name)) ?? user.id
    return {
      account_id:       resolvedAccountId,
      stage_id:         stageId,
      deal_name:        d.deal_name,
      deal_description: d.deal_description || null,
      deal_owner_id:    ownerId,
      value_amount:     d.value_amount > 0 ? d.value_amount : null,
      currency:         'CAD',
      close_date:       d.close_date,
      last_activity_at: now,
      _notes:           d.notes,
      _owner_id:        ownerId,
    }
  }).filter((r): r is NonNullable<DealRow> => r !== null && !!r.stage_id)

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No deals could be matched to a valid stage' }, { status: 422 })
  }

  // Deduplicate: find deals already in DB with matching (account_id, deal_name)
  const dealNames  = rows.map(r => r.deal_name)
  const accountIds = [...new Set(rows.map(r => r.account_id))]
  const { data: existingDeals } = await admin
    .from('deals')
    .select('id, deal_name, account_id')
    .in('deal_name', dealNames)
    .in('account_id', accountIds)
  const existingDealMap = new Map(
    (existingDeals ?? []).map((d: { id: string; deal_name: string; account_id: string }) =>
      [`${normalizeString(d.deal_name)}|${d.account_id}`, d.id]
    )
  )

  const newRows      = rows.filter(r => !existingDealMap.has(`${normalizeString(r.deal_name)}|${r.account_id}`))
  const existingRows = rows
    .map(r => {
      const id = existingDealMap.get(`${normalizeString(r.deal_name)}|${r.account_id}`)
      return id ? { id, _notes: r._notes, _owner_id: r._owner_id } : null
    })
    .filter((r): r is { id: string; _notes: ParsedNote[]; _owner_id: string } => r !== null)

  // Insert only new deals
  const dbRows = newRows.map(({ _notes: _n, _owner_id: _o, ...r }) => r)
  const { data: inserted, error: insertErr } = dbRows.length > 0
    ? await admin.from('deals').insert(dbRows).select('id')
    : { data: [], error: null }
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Combine new + existing deals for note insertion
  const allDealIds = [
    ...(inserted ?? []).map((ins, i) => ({ id: ins.id, _notes: newRows[i]._notes, _owner_id: newRows[i]._owner_id })),
    ...existingRows,
  ]

  // Load existing notes for all deals to deduplicate
  const allIds = allDealIds.map(r => r.id)
  const { data: existingNotes } = allIds.length > 0
    ? await admin.from('notes').select('entity_id, note_text').eq('entity_type', 'deal').in('entity_id', allIds)
    : { data: [] }
  const existingNoteSet = new Set(
    (existingNotes ?? []).map((n: { entity_id: string; note_text: string }) => `${n.entity_id}::${n.note_text}`)
  )

  // Insert only new notes with their modified_at timestamps
  const noteRows = allDealIds.flatMap(d =>
    d._notes
      .filter(note => !existingNoteSet.has(`${d.id}::${note.text}`))
      .map(note => ({
        entity_type: 'deal',
        entity_id:   d.id,
        note_text:   note.text,
        created_by:  d._owner_id,
        created_at:  note.modified_at ?? now,
      }))
  )
  if (noteRows.length > 0) {
    await admin.from('notes').insert(noteRows)
  }

  // Trigger health score computation for each newly inserted deal (fire-and-forget)
  const origin = req.nextUrl.origin
  for (const { id } of inserted ?? []) {
    fetch(`${origin}/api/deals/${id}/health-score`, {
      method: 'POST',
      headers: { cookie: req.headers.get('cookie') ?? '' },
    }).catch(() => { /* silent */ })
  }

  return NextResponse.json({
    inserted: inserted?.length ?? 0,
    existing: existingRows.length,
    skipped:  parsedDeals.length - rows.length,
  })
}
