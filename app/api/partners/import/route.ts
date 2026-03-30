import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── CSV parser (same pattern as /api/deals/import) ────────────────────────────

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

function parseNum(val: string): number | null {
  if (!val || !val.trim()) return null
  const n = parseFloat(val.replace(/[^0-9.\-]/g, ''))
  return isFinite(n) ? n : null
}

function normalise(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Normalise any date string to the 1st of its month (YYYY-MM-01). */
function toFirstOfMonth(raw: string): string | null {
  if (!raw.trim()) return null
  const d = new Date(raw.trim())
  if (isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

// ── Metric → category mapping ─────────────────────────────────────────────────

const METRIC_CATEGORY: Record<string, string> = {
  mrr:                            'revenue',
  yoy_growth_pct:                 'revenue',
  revenue_consistency_score:      'revenue',
  revenue_3mo_trend_pct:          'growth',
  customer_growth_pct:            'growth',
  net_churn_pct:                  'growth',
  service_upgrades_count_3mo:     'growth',
  active_paid_products_count:     'product',
  new_services_activated_3mo:     'product',
  upsell_potential_score:         'product',
  whos_logins_30d:                'engagement',
  campaign_open_rate_pct:         'engagement',
  mops_response_rate_pct:         'engagement',
  newsletter_open_rate_pct:       'engagement',
  engagement_score_override:      'engagement',
  support_tickets_30d:            'support',
  escalations_30d:                'support',
  support_sla_pct:                'support',
  server_sla_pct:                 'support',
  email_availability_pct:         'support',
  portal_availability_pct:        'support',
  webmail_login_availability_pct: 'support',
  health_score_override:          'financial',
}

const METRIC_KEYS = Object.keys(METRIC_CATEGORY)

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  let formData: FormData
  try { formData = await req.formData() }
  catch { return Response.json({ error: 'Invalid request body' }, { status: 400 }) }

  const file = formData.get('file') as File | null
  if (!file) return Response.json({ error: 'No file provided' }, { status: 400 })

  const text = await file.text()
  const allRows = parseCSVText(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)

  if (allRows.length < 2) return Response.json({ error: 'CSV has no data rows' }, { status: 400 })

  // Detect header row
  let headerIdx = -1
  for (let i = 0; i < Math.min(allRows.length, 5); i++) {
    const lower = allRows[i].map(c => c.trim().toLowerCase())
    if (lower.includes('partner_name') || lower.includes('partner_id')) { headerIdx = i; break }
  }
  if (headerIdx === -1) {
    return Response.json({ error: 'Could not find header row. Expected columns: partner_name, partner_id, as_of_date' }, { status: 400 })
  }

  const headers = allRows[headerIdx].map(h => normalise(h).replace(/\s+/g, '_'))
  const col     = (name: string) => headers.indexOf(name)
  const get     = (row: string[], name: string) => (row[col(name)] ?? '').trim()

  // Load reference data once
  const [{ data: profilesData }, { data: existingPartners }] = await Promise.all([
    admin.from('profiles').select('id, full_name'),
    admin.from('partners').select('id, partner_name, partner_code'),
  ])

  const profileMap = new Map<string, string>()
  for (const p of profilesData ?? []) {
    if (p.full_name) profileMap.set(normalise(p.full_name), p.id)
  }

  const partnerByCode = new Map<string, string>() // lower(code) → id
  const partnerByName = new Map<string, string>() // normalised name → id
  for (const p of existingPartners ?? []) {
    if (p.partner_code?.trim()) partnerByCode.set(p.partner_code.trim().toLowerCase(), p.id)
    partnerByName.set(normalise(p.partner_name), p.id)
  }

  const dataRows = allRows.slice(headerIdx + 1)

  let importedCount = 0
  let updatedCount  = 0
  let skippedCount  = 0
  let errorCount    = 0
  const errors: string[] = []
  const processedPartnerIds = new Set<string>()

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row        = dataRows[rowIdx]
    const lineNum    = rowIdx + headerIdx + 2
    const partnerCode = get(row, 'partner_id')
    const partnerName = get(row, 'partner_name')
    const asOfDateRaw = get(row, 'as_of_date')

    if (!partnerName) { skippedCount++; continue }

    const metricDate = toFirstOfMonth(asOfDateRaw)
    if (!metricDate) {
      errors.push(`Row ${lineNum}: invalid as_of_date "${asOfDateRaw}" — expected YYYY-MM-DD`)
      errorCount++; skippedCount++; continue
    }

    // Find or create partner
    let partnerId: string | null = null

    if (partnerCode && partnerByCode.has(partnerCode.toLowerCase())) {
      partnerId = partnerByCode.get(partnerCode.toLowerCase())!
    } else if (partnerByName.has(normalise(partnerName))) {
      partnerId = partnerByName.get(normalise(partnerName))!
    }

    const ownerName = get(row, 'owner_name')
    const ownerId   = ownerName ? (profileMap.get(normalise(ownerName)) ?? null) : null
    const region    = get(row, 'region') || null

    if (!partnerId) {
      // Create new partner
      const { data: newPartner, error: createErr } = await admin
        .from('partners')
        .insert({
          partner_name:       partnerName,
          partner_code:       partnerCode || null,
          partner_type:       'reseller',
          tier:               'tier2',
          status:             'active',
          region,
          account_manager_id: ownerId,
        })
        .select('id')
        .single()

      if (createErr || !newPartner) {
        errors.push(`Row ${lineNum}: could not create partner "${partnerName}": ${createErr?.message ?? 'unknown error'}`)
        errorCount++; skippedCount++; continue
      }

      partnerId = newPartner.id
      if (partnerCode) partnerByCode.set(partnerCode.toLowerCase(), partnerId!)
      partnerByName.set(normalise(partnerName), partnerId!)
      importedCount++
    } else {
      // Upsert partner metadata from CSV
      const patch: Record<string, unknown> = {}
      if (partnerCode && !partnerByCode.has(partnerCode.toLowerCase())) patch.partner_code = partnerCode
      if (region) patch.region = region
      if (ownerId) patch.account_manager_id = ownerId
      if (Object.keys(patch).length) await admin.from('partners').update(patch).eq('id', partnerId)
      updatedCount++
    }

    processedPartnerIds.add(partnerId)

    // Build metric rows for this partner-month
    const metricRows: {
      partner_id:   string
      metric_date:  string
      category:     string
      metric_key:   string
      metric_value: number
      source:       string
    }[] = []

    for (const key of METRIC_KEYS) {
      const rawVal = get(row, key)
      if (!rawVal) continue
      const val = parseNum(rawVal)
      if (val === null) continue
      metricRows.push({
        partner_id:   partnerId,
        metric_date:  metricDate,
        category:     METRIC_CATEGORY[key],
        metric_key:   key,
        metric_value: val,
        source:       'import',
      })
    }

    if (metricRows.length > 0) {
      const { error: metricErr } = await admin
        .from('partner_metrics')
        .upsert(metricRows, { onConflict: 'partner_id,metric_date,metric_key' })
      if (metricErr) {
        errors.push(`Row ${lineNum}: metric upsert failed — ${metricErr.message}`)
        errorCount++
      }
    }

    // Optional note
    const noteText = get(row, 'notes')
    if (noteText) {
      await admin.from('notes').insert({
        entity_type: 'partner',
        entity_id:   partnerId,
        note_text:   noteText,
        created_by:  user.id,
      })
    }
  }

  // Recalculate health scores for every partner touched in this import
  for (const pid of processedPartnerIds) {
    await admin.rpc('recompute_partner_health_score', { p_partner_id: pid })
  }

  // Write import log
  const status =
    errorCount > 0 && importedCount + updatedCount === 0 ? 'failed' :
    errorCount > 0 ? 'partial' : 'success'

  await admin.from('partner_health_import_log').insert({
    imported_by:   user.id,
    row_count:     dataRows.length,
    partner_count: importedCount + updatedCount,
    skipped_count: skippedCount,
    error_count:   errorCount,
    status,
    message: errors.length ? errors.slice(0, 5).join('; ') : null,
  })

  return Response.json({
    imported: importedCount,
    updated:  updatedCount,
    skipped:  skippedCount,
    errors:   errors.slice(0, 10),
  })
}
