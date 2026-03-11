import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PartnerDetailInitialData, PartnerWithRelations } from '@/lib/partner-types'
import PartnerDetailClient from './PartnerDetailClient'

type Props = { params: Promise<{ id: string }> }

export default async function PartnerDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: configData } = await admin
    .from('partner_health_config')
    .select('stale_days')
    .limit(1)
    .single()

  const staleDays = configData?.stale_days ?? 30

  // Current month and previous month dates
  const now       = new Date()
  const curMonth  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)

  const [
    { data: { user } },
    { data: partnerData, error: partnerErr },
    { data: healthScore },
    { data: metricsData },
    { data: prevMetricsData },
    { data: snapshotsData },
    { data: alertsData },
    { data: notesData },
    { data: profilesData },
    { data: accountsData },
  ] = await Promise.all([
    supabase.auth.getUser(),

    // Partner with relations (RLS-protected)
    supabase
      .from('partners')
      .select(`
        *,
        account_manager:profiles!account_manager_id(full_name),
        account:accounts!account_id(account_name)
      `)
      .eq('id', id)
      .single(),

    // Health score
    supabase
      .from('partner_health_scores')
      .select('*')
      .eq('partner_id', id)
      .single(),

    // Current month metrics
    supabase
      .from('partner_metrics')
      .select('*')
      .eq('partner_id', id)
      .eq('metric_date', curMonth)
      .order('category')
      .order('metric_key'),

    // Previous month metrics (for trend context)
    supabase
      .from('partner_metrics')
      .select('*')
      .eq('partner_id', id)
      .eq('metric_date', prevMonth)
      .order('category')
      .order('metric_key'),

    // Last 6 monthly snapshots for sparkline
    supabase
      .from('partner_health_snapshots')
      .select('snapshot_month, overall_score')
      .eq('partner_id', id)
      .order('snapshot_month', { ascending: false })
      .limit(6),

    // Active alerts
    supabase
      .from('partner_health_alerts')
      .select('*')
      .eq('partner_id', id)
      .eq('is_active', true)
      .order('triggered_at', { ascending: false }),

    // Recent notes (last 10)
    supabase
      .from('notes')
      .select('id, note_text, created_at, created_by, author:profiles!created_by(full_name)')
      .eq('entity_type', 'partner')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(10),

    // Profiles for dropdowns
    supabase
      .from('profiles')
      .select('id, full_name')
      .order('full_name'),

    // Accounts for linking
    supabase
      .from('accounts')
      .select('id, account_name')
      .order('account_name'),
  ])

  if (partnerErr || !partnerData) notFound()

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id ?? '')
    .single()

  // Reshape notes to include author name
  const recentNotes = (notesData ?? []).map((n: Record<string, unknown>) => ({
    id:              n.id as string,
    note_text:       n.note_text as string,
    created_at:      n.created_at as string,
    created_by_name: (n.author as { full_name: string | null } | null)?.full_name ?? null,
  }))

  const initialData: PartnerDetailInitialData = {
    partner:         partnerData as PartnerWithRelations,
    healthScore:     healthScore ?? null,
    metrics:         metricsData ?? [],
    prevMetrics:     prevMetricsData ?? [],
    snapshots:       (snapshotsData ?? []) as Array<{ snapshot_month: string; overall_score: number | null }>,
    alerts:          alertsData ?? [],
    recentNotes,
    profiles:        profilesData ?? [],
    accounts:        accountsData ?? [],
    currentUserId:   user?.id ?? '',
    currentUserRole: (currentProfile as { role: string } | null)?.role ?? '',
    staleDays,
  }

  return <PartnerDetailClient initialData={initialData} />
}
