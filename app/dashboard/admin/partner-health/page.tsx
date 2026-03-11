import { createAdminClient } from '@/lib/supabase/admin'
import type { PartnerHealthConfig } from '@/lib/partner-types'
import PartnerHealthConfigClient from './partner-health-client'

export default async function PartnerHealthConfigPage() {
  const admin = createAdminClient()

  const { data } = await admin
    .from('partner_health_config')
    .select('id, category_weights, thresholds, stale_days, model_version')
    .limit(1)
    .single()

  return <PartnerHealthConfigClient config={data as PartnerHealthConfig} />
}
