// ── Partner Health utilities ──────────────────────────────────────────────────
// TypeScript layer on top of the Postgres scoring RPCs.
// Provides display helpers, category metadata, and metric definitions.

import type { HealthStatus, AlertSeverity, MetricCategory } from './partner-types'

// ── Status display helpers ────────────────────────────────────────────────────

export function healthStatusLabel(status: HealthStatus | null | undefined): string {
  switch (status) {
    case 'healthy':           return 'Healthy'
    case 'at_risk':           return 'At Risk'
    case 'critical':          return 'Critical'
    case 'insufficient_data': return 'No Data'
    default:                  return '—'
  }
}

export function healthStatusBadgeClass(status: HealthStatus | null | undefined): string {
  switch (status) {
    case 'healthy':           return 'bg-green-100 text-green-700'
    case 'at_risk':           return 'bg-amber-100 text-amber-700'
    case 'critical':          return 'bg-red-100 text-red-600'
    case 'insufficient_data': return 'bg-gray-100 text-gray-400'
    default:                  return 'bg-gray-100 text-gray-400'
  }
}

export function scoreBadgeClass(score: number | null | undefined): string {
  if (score == null) return 'bg-gray-100 text-gray-400'
  if (score >= 75)   return 'bg-green-100 text-green-700'
  if (score >= 50)   return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-600'
}

export function alertSeverityClass(severity: AlertSeverity | null | undefined): string {
  switch (severity) {
    case 'critical': return 'bg-red-100 text-red-700'
    case 'warning':  return 'bg-amber-100 text-amber-700'
    case 'info':     return 'bg-blue-100 text-blue-700'
    default:         return 'bg-gray-100 text-gray-500'
  }
}

export function scoreDeltaDisplay(delta: number | null | undefined): { text: string; cls: string } {
  if (delta == null || Math.abs(delta) <= 3) return { text: '—', cls: 'text-gray-400' }
  if (delta > 0) return { text: `↑ +${delta}`, cls: 'text-green-600' }
  return { text: `↓ ${delta}`, cls: 'text-red-500' }
}

export function relativeTime(isoDate: string | null | undefined): string {
  if (!isoDate) return 'Never'
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (diff < 60)         return 'Just now'
  if (diff < 3600)       return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)      return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
  return new Date(isoDate).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Category metadata ─────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  revenue:    'Revenue Performance',
  product:    'Product Adoption',
  customer:   'Customer Base Health',
  engagement: 'Partner Engagement',
  support:    'Support & Ops Health',
  financial:  'Financial Health',
  growth:     'Growth Momentum',
  strategic:  'Strategic Alignment',
}

export const CATEGORY_ORDER = [
  'revenue', 'product', 'customer', 'engagement',
  'support', 'financial', 'growth', 'strategic',
]

export const DEFAULT_WEIGHTS: Record<string, number> = {
  revenue: 20, product: 15, customer: 15, engagement: 15,
  support: 10, financial: 10, growth: 10, strategic: 5,
}

export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key
}

// ── Metric definitions (for the metrics entry form) ───────────────────────────
// CRM-native metrics (derived from notes/deals) are marked source:'crm' and
// shown as read-only in the UI.

export const METRIC_CATEGORIES: MetricCategory[] = [
  {
    key: 'revenue', label: 'Revenue Performance', weight: 20,
    metrics: [
      { key: 'mrr',                  label: 'Monthly Recurring Revenue',     unit: 'currency', description: 'Total MRR this month',                                    value: '' },
      { key: 'mrr_growth_qoq',       label: 'QoQ MRR Growth %',              unit: 'percent',  description: 'Quarter-over-quarter MRR growth rate',                   value: '' },
      { key: 'mrr_growth_yoy',       label: 'YoY MRR Growth %',              unit: 'percent',  description: 'Year-over-year MRR growth rate',                         value: '' },
      { key: 'revenue_consistency',  label: 'Revenue Consistency Score',      unit: 'number',   description: 'Admin-assigned 0–100 score for MRR stability',          value: '' },
      { key: 'upsell_events_qtd',    label: 'Upsell Events (Quarter)',        unit: 'number',   description: 'Count of upsell events this quarter',                    value: '' },
      { key: 'revenue_concentration',label: 'Revenue Concentration %',        unit: 'percent',  description: 'Top product revenue as % of total (lower = better)',    value: '' },
    ],
  },
  {
    key: 'product', label: 'Product Adoption', weight: 15,
    metrics: [
      { key: 'active_product_lines',  label: 'Active Product Lines',          unit: 'number',  description: 'Count of distinct products sold',                        value: '' },
      { key: 'portfolio_coverage_pct',label: 'Portfolio Coverage %',           unit: 'percent', description: 'Percentage of full product portfolio sold',              value: '' },
      { key: 'attach_rate',           label: 'Average Products per Customer',  unit: 'number',  description: 'Average products sold per end-customer',                 value: '' },
      { key: 'adoption_trend_pct',    label: 'Adoption Trend MoM %',           unit: 'percent', description: 'Month-over-month change in portfolio coverage',          value: '' },
    ],
  },
  {
    key: 'customer', label: 'Customer Base Health', weight: 15,
    metrics: [
      { key: 'active_end_customers',     label: 'Active End Customers',        unit: 'number',  description: 'Total active end-customers',                            value: '' },
      { key: 'net_new_customers_mtd',    label: 'Net New Customers (Month)',   unit: 'number',  description: 'Acquired minus churned this month',                     value: '' },
      { key: 'churn_rate_pct',           label: 'Customer Churn Rate %',       unit: 'percent', description: 'Percentage of customers churned this period',           value: '' },
      { key: 'avg_services_per_customer',label: 'Avg Services per Customer',   unit: 'number',  description: 'Average services cross-sold per customer',              value: '' },
      { key: 'activation_velocity_days', label: 'Activation Velocity (Days)',  unit: 'days',    description: 'Days from new customer to first service activation',    value: '' },
    ],
  },
  {
    key: 'engagement', label: 'Partner Engagement', weight: 15,
    metrics: [
      { key: 'qbr_count_ytd',             label: 'QBRs Held (Year-to-Date)',  unit: 'number',  description: 'Quarterly business reviews held this year',             value: '' },
      { key: 'training_completion_pct',   label: 'Training Completion %',     unit: 'percent', description: 'Percentage of required certifications completed',       value: '' },
      { key: 'campaign_participation_pct',label: 'Campaign Participation %',  unit: 'percent', description: 'Percentage of partner campaigns participated in',       value: '' },
    ],
  },
  {
    key: 'support', label: 'Support & Ops Health', weight: 10,
    metrics: [
      { key: 'ticket_volume_30d',   label: 'Ticket Volume (30 Days)',          unit: 'number',  description: 'Support tickets opened in last 30 days',                value: '' },
      { key: 'ticket_trend_pct',    label: 'Ticket Volume Trend MoM %',        unit: 'percent', description: 'Month-over-month change in ticket volume',              value: '' },
      { key: 'escalation_rate_pct', label: 'Escalation Rate %',                unit: 'percent', description: 'Escalated tickets as percentage of total',             value: '' },
      { key: 'sla_breach_rate_pct', label: 'SLA Breach Rate %',                unit: 'percent', description: 'SLA-breached tickets as percentage of total',          value: '' },
      { key: 'avg_resolution_days', label: 'Avg Resolution Time (Days)',        unit: 'days',    description: 'Average days to resolve support tickets',              value: '' },
    ],
  },
  {
    key: 'financial', label: 'Financial Health', weight: 10,
    metrics: [
      { key: 'overdue_balance',          label: 'Overdue AR Balance',          unit: 'currency', description: 'Total outstanding overdue balance',                   value: '' },
      { key: 'ar_aging_days',            label: 'AR Aging (Days)',              unit: 'days',     description: 'Average days outstanding for accounts receivable',   value: '' },
      { key: 'dso',                      label: 'Days Sales Outstanding',       unit: 'days',     description: 'DSO metric',                                         value: '' },
      { key: 'payment_consistency_score',label: 'Payment Consistency Score',    unit: 'number',   description: 'On-time payment rate 0–100',                         value: '' },
    ],
  },
  {
    key: 'growth', label: 'Growth Momentum', weight: 10,
    metrics: [
      { key: 'expansion_trend_pct', label: 'Expansion Trend MoM %',            unit: 'percent', description: 'Month-over-month revenue expansion rate',              value: '' },
      { key: 'launch_readiness_score', label: 'Launch Readiness Score',         unit: 'number',  description: 'Admin-assigned 0–100 new-product launch readiness',   value: '' },
    ],
  },
  {
    key: 'strategic', label: 'Strategic Alignment', weight: 5,
    metrics: [
      { key: 'executive_sponsor_engaged', label: 'Executive Sponsor Active',   unit: 'boolean', description: '1 = exec sponsor actively engaged, 0 = not',          value: '' },
      { key: 'beta_participant',          label: 'Beta Program Participant',    unit: 'boolean', description: '1 = participating in beta programs, 0 = not',         value: '' },
      { key: 'roadmap_sessions_ytd',      label: 'Roadmap Sessions (YTD)',      unit: 'number',  description: 'Roadmap alignment sessions held this year',           value: '' },
      { key: 'ai_tools_adopted',          label: 'AI Tools Adopted',            unit: 'number',  description: 'Count of AI/automation tools adopted',               value: '' },
      { key: 'strategic_priority_score',  label: 'Strategic Priority Score',    unit: 'number',  description: 'Admin-assigned 0–100 strategic fit score',           value: '' },
    ],
  },
]

// ── Type/Tier label helpers ───────────────────────────────────────────────────

export const PARTNER_TYPE_LABELS: Record<string, string> = {
  reseller: 'Reseller', isp: 'ISP', telecom: 'Telecom',
  wholesale: 'Wholesale', strategic: 'Strategic', other: 'Other',
}

export const PARTNER_TIER_LABELS: Record<string, string> = {
  enterprise: 'Enterprise', tier1: 'Tier 1', tier2: 'Tier 2', tier3: 'Tier 3',
}

export const PARTNER_STATUS_LABELS: Record<string, string> = {
  active: 'Active', at_risk: 'At Risk', churned: 'Churned',
  onboarding: 'Onboarding', inactive: 'Inactive',
}

export function tierBadgeClass(tier: string): string {
  switch (tier) {
    case 'enterprise': return 'bg-purple-100 text-purple-700'
    case 'tier1':      return 'bg-blue-100 text-blue-700'
    case 'tier2':      return 'bg-gray-100 text-gray-600'
    case 'tier3':      return 'bg-gray-50 text-gray-500'
    default:           return 'bg-gray-100 text-gray-500'
  }
}

export function partnerStatusBadgeClass(status: string): string {
  switch (status) {
    case 'active':     return 'bg-green-50 text-green-700'
    case 'at_risk':    return 'bg-amber-50 text-amber-700'
    case 'churned':    return 'bg-red-50 text-red-600'
    case 'onboarding': return 'bg-blue-50 text-blue-700'
    case 'inactive':   return 'bg-gray-50 text-gray-500'
    default:           return 'bg-gray-50 text-gray-500'
  }
}

// ── Score threshold helpers ───────────────────────────────────────────────────

export function categoryScoreClass(
  score: number | null | undefined,
  thresholds: { healthy: number; at_risk: number } = { healthy: 75, at_risk: 50 }
): string {
  if (score == null) return 'text-gray-400'
  if (score >= thresholds.healthy) return 'text-green-600'
  if (score >= thresholds.at_risk) return 'text-amber-600'
  return 'text-red-600'
}

export function categoryBarClass(
  score: number | null | undefined,
  thresholds: { healthy: number; at_risk: number } = { healthy: 75, at_risk: 50 }
): string {
  if (score == null) return 'bg-gray-200'
  if (score >= thresholds.healthy) return 'bg-green-500'
  if (score >= thresholds.at_risk) return 'bg-amber-400'
  return 'bg-red-400'
}
