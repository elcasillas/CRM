// ── Partner Health Index — TypeScript types ───────────────────────────────────
// These types are hand-written (not auto-generated from the DB schema) because
// they include RPC return shapes and server-to-client bundles.

export type PartnerType    = 'reseller' | 'isp' | 'telecom' | 'wholesale' | 'strategic' | 'other'
export type PartnerTier    = 'enterprise' | 'tier1' | 'tier2' | 'tier3'
export type PartnerStatus  = 'active' | 'at_risk' | 'churned' | 'onboarding' | 'inactive'
export type HealthStatus   = 'healthy' | 'at_risk' | 'critical' | 'insufficient_data'
export type AlertSeverity  = 'critical' | 'warning' | 'info'

// ── Core table types ──────────────────────────────────────────────────────────

export interface Partner {
  id:                  string
  partner_name:        string
  partner_type:        PartnerType
  tier:                PartnerTier
  status:              PartnerStatus
  account_id:          string | null
  account_manager_id:  string | null
  region:              string | null
  country:             string | null
  website:             string | null
  description:         string | null
  created_at:          string
  updated_at:          string
}

export interface PartnerWithRelations extends Partner {
  account_manager: { full_name: string | null } | null
  account:         { account_name: string }     | null
}

export interface PartnerHealthScore {
  id:               string
  partner_id:       string
  overall_score:    number | null
  health_status:    HealthStatus | null
  risk_score:       number | null
  growth_score:     number | null
  confidence_score: number | null
  category_scores:  Record<string, number> | null
  score_debug:      Record<string, unknown> | null
  model_version:    string
  computed_at:      string
}

export interface PartnerMetric {
  id:           string
  partner_id:   string
  metric_date:  string   // ISO date: first of month
  category:     string
  metric_key:   string
  metric_value: number | null
  source:       string
  notes:        string | null
}

export interface PartnerHealthAlert {
  id:           string
  partner_id:   string
  alert_type:   string
  severity:     AlertSeverity
  message:      string
  triggered_at: string
  resolved_at:  string | null
  is_active:    boolean
}

export interface PartnerAISummaryRecord {
  id:                     string
  partner_id:             string
  metrics_hash:           string
  executive_summary:      string | null
  risk_summary:           string | null
  growth_summary:         string | null
  recommended_actions:    Array<{ priority: string; action: string; rationale: string }> | null
  outreach_email_subject: string | null
  outreach_email_body:    string | null
  qbr_talking_points:     string[] | null
  model:                  string
  generated_at:           string
}

export interface PartnerHealthConfig {
  id:               string
  category_weights: Record<string, number>
  thresholds:       { healthy: number; at_risk: number; critical: number }
  stale_days:       number
  model_version:    string
}

// ── RPC flat row type (from get_partners_page) ────────────────────────────────

export interface PartnerPageRow {
  id:                   string
  partner_name:         string
  partner_type:         PartnerType
  tier:                 PartnerTier
  status:               PartnerStatus
  region:               string | null
  country:              string | null
  website:              string | null
  description:          string | null
  account_id:           string | null
  account_manager_id:   string | null
  account_manager_name: string | null
  account_name:         string | null
  overall_score:        number | null
  health_status:        HealthStatus | null
  risk_score:           number | null
  growth_score:         number | null
  confidence_score:     number | null
  category_scores:      Record<string, number> | null
  computed_at:          string | null
  score_delta_3mo:      number | null
  days_since_last_note: number | null
  active_alert_count:   number
  top_alert_severity:   AlertSeverity | null
  created_at:           string
  updated_at:           string
}

// ── Server → Client data bundles ──────────────────────────────────────────────

export interface PartnersInitialData {
  partners:        PartnerPageRow[]
  profiles:        Array<{ id: string; full_name: string | null }>
  accounts:        Array<{ id: string; account_name: string }>
  currentUserId:   string
  currentUserRole: string
  staleDays:       number
}

export interface PartnerDetailInitialData {
  partner:         PartnerWithRelations
  healthScore:     PartnerHealthScore | null
  metrics:         PartnerMetric[]
  prevMetrics:     PartnerMetric[]
  snapshots:       Array<{ snapshot_month: string; overall_score: number | null }>
  alerts:          PartnerHealthAlert[]
  recentNotes:     Array<{ id: string; note_text: string; created_at: string; created_by_name: string | null }>
  profiles:        Array<{ id: string; full_name: string | null }>
  accounts:        Array<{ id: string; account_name: string }>
  currentUserId:   string
  currentUserRole: string
  staleDays:       number
}

// ── Metric form types ─────────────────────────────────────────────────────────

export interface MetricFormEntry {
  key:         string
  label:       string
  unit:        string          // 'number' | 'percent' | 'currency' | 'days' | 'boolean'
  description: string
  value:       string          // string for input; parsed on save
}

export interface MetricCategory {
  key:     string
  label:   string
  weight:  number
  metrics: MetricFormEntry[]
}

// ── Partner form data ─────────────────────────────────────────────────────────

export interface PartnerFormData {
  partner_name:       string
  partner_type:       PartnerType
  tier:               PartnerTier
  status:             PartnerStatus
  account_id:         string
  account_manager_id: string
  region:             string
  country:            string
  website:            string
  description:        string
}
