// ── Inspection check definitions ─────────────────────────────────────────────
// A leaf module with no imports. The check list is needed both by the
// inspection engine and by the stage criteria that scope it, and keeping it
// here breaks what would otherwise be an import cycle:
// deal-stage-criteria -> deal-inspect -> deal-summarize -> deal-stage-criteria.

export interface InspectionCheckDef {
  id:       string
  label:    string
  severity: 'critical' | 'medium' | 'low'
  enabled:  boolean
}


export const DEFAULT_CHECKS: InspectionCheckDef[] = [
  { id: 'stage_valid',           label: 'Deal stage is present and valid',                    severity: 'critical', enabled: true },
  { id: 'close_date_credible',   label: 'Close date is present and still credible',           severity: 'critical', enabled: true },
  { id: 'amount_reasonable',     label: 'Amount is present and reasonable',                   severity: 'critical', enabled: true },
  { id: 'contract_term',         label: 'Contract term is present',                           severity: 'medium',   enabled: true },
  { id: 'acv_tcv_aligned',       label: 'ACV and TCV are present and aligned',                severity: 'medium',   enabled: true },
  { id: 'next_step_defined',     label: 'Next step is clearly defined',                       severity: 'critical', enabled: true },
  { id: 'next_step_owner',       label: 'Next step owner is clear',                           severity: 'medium',   enabled: true },
  { id: 'next_step_date',        label: 'Next step date is present',                          severity: 'medium',   enabled: true },
  { id: 'recent_update',         label: 'Last meaningful update is recent',                   severity: 'medium',   enabled: true },
  { id: 'decision_process',      label: 'Customer decision process is described',             severity: 'critical', enabled: true },
  { id: 'economic_buyer',        label: 'Executive decision maker is identified',             severity: 'critical', enabled: true },
  { id: 'business_problem',      label: 'Business problem or use case is defined',            severity: 'medium',   enabled: true },
  { id: 'blockers_documented',   label: 'Blockers or risks are documented',                   severity: 'medium',   enabled: true },
  { id: 'customer_intent',       label: 'Customer intent or commitment level is described',   severity: 'critical', enabled: true },
  { id: 'implementation_target', label: 'Timeline or implementation target is documented',    severity: 'low',      enabled: true },
]
