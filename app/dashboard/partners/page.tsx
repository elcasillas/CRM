import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import PartnersClient from './PartnersClient'

export type PartnerRow = {
  id:                   string
  partner_name:         string
  partner_type:         string
  tier:                 string
  status:               string
  region:               string | null
  account_manager_name: string | null
  overall_score:        number | null
  health_status:        string | null
  risk_score:           number | null
  growth_score:         number | null
  confidence_score:     number | null
  score_delta_3mo:      number | null
  computed_at:          string | null
  active_alert_count:   number
  top_alert_severity:   string | null
}

export type ImportLogRow = {
  imported_at:   string
  row_count:     number
  partner_count: number
  skipped_count: number
  error_count:   number
  status:        string
  message:       string | null
}

export default async function PartnersPage() {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const [{ data: partnersData }, { data: importLog }] = await Promise.all([
    supabase.rpc('get_partners_page', {}),
    admin
      .from('partner_health_import_log')
      .select('imported_at,row_count,partner_count,skipped_count,error_count,status,message')
      .order('imported_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  return (
    <Suspense>
      <PartnersClient
        initialPartners={(partnersData ?? []) as PartnerRow[]}
        lastImport={(importLog as ImportLogRow) ?? null}
      />
    </Suspense>
  )
}
