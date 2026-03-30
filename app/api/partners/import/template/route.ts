const HEADERS = [
  'partner_id', 'partner_name', 'owner_name', 'region', 'as_of_date', 'currency',
  'mrr', 'yoy_growth_pct', 'revenue_consistency_score', 'revenue_3mo_trend_pct',
  'customer_growth_pct', 'net_churn_pct', 'service_upgrades_count_3mo',
  'active_paid_products_count', 'new_services_activated_3mo', 'upsell_potential_score',
  'whos_logins_30d', 'campaign_open_rate_pct', 'mops_response_rate_pct',
  'newsletter_open_rate_pct', 'engagement_score_override',
  'support_tickets_30d', 'escalations_30d', 'support_sla_pct', 'server_sla_pct',
  'email_availability_pct', 'portal_availability_pct', 'webmail_login_availability_pct',
  'health_score_override', 'notes',
]

const SAMPLE = [
  'PARTNER001', 'Acme Reseller', 'Jane Smith', 'North America', '2026-03-01', 'CAD',
  '15000', '8.5', '85', '5.2',
  '3.1', '2.4', '4',
  '6', '2', '72',
  '320', '24.5', '31.2',
  '18.7', '',
  '12', '1', '98.5', '99.2',
  '99.8', '99.5', '99.1',
  '', 'Q1 performance review completed',
]

export async function GET() {
  const csv = [HEADERS.join(','), SAMPLE.join(',')].join('\r\n')
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="partner-health-import-template.csv"',
    },
  })
}
