import { DEFAULT_CHECKS } from './deal-inspect'

// ── Stage-appropriate inspection scope ───────────────────────────────────────
// A deal early in the pipeline should not be questioned about things that are
// not yet expected of it. Each stage names the criteria that matter at that
// point, and follow-up generation is limited to them, so an Initial
// Conversation deal is never asked about contract terms and a Contract
// Negotiations deal is never asked to restate its business problem.
//
// checkIds are inspection check ids from DEFAULT_CHECKS in deal-inspect, so the
// scope and the inspection engine cannot drift apart.

export interface StageCriteria {
  /** stage name as stored in deal_stages.stage_name */
  stage: string
  /** what the stage is trying to establish */
  maturity: string
  /** the guideline shown to the model */
  guideline: string
  /** inspection check ids in scope at this stage */
  checkIds: string[]
}

export const STAGE_CRITERIA: StageCriteria[] = [
  {
    stage: 'Initial Conversation',
    maturity: 'the opportunity is real',
    guideline: 'Confirm there is a legitimate opportunity and establish basic deal hygiene.',
    checkIds: [
      'stage_valid',
      'close_date_credible',
      'amount_reasonable',
      'recent_update',
      'business_problem',
      'next_step_defined',
      'next_step_owner',
      'next_step_date',
    ],
  },
  {
    stage: 'Solution Qualified',
    maturity: 'the opportunity is viable',
    guideline: 'Confirm the opportunity is commercially and technically qualified enough to pursue.',
    checkIds: [
      'contract_term',
      'acv_tcv_aligned',
      'implementation_target',
      'blockers_documented',
    ],
  },
  {
    stage: 'Presenting to EDM',
    maturity: 'the decision path is understood',
    guideline: 'Confirm access to the decision process and the people who can approve the opportunity.',
    checkIds: [
      'economic_buyer',
      'decision_process',
    ],
  },
  {
    stage: 'Short Listed',
    maturity: 'customer intent is demonstrated',
    guideline: 'Confirm the customer is seriously considering the solution and that there is evidence of competitive position and intent.',
    checkIds: [
      'customer_intent',
      'close_date_credible',
    ],
  },
  {
    stage: 'Contract Negotiations',
    maturity: 'the path to signature is clear',
    guideline: 'Confirm there is a clear path to signature and that the commercial details accurately reflect the expected agreement.',
    checkIds: [
      'amount_reasonable',
      'contract_term',
      'acv_tcv_aligned',
      'blockers_documented',
      'next_step_defined',
      'next_step_owner',
      'next_step_date',
    ],
  },
]

const BY_STAGE = new Map(STAGE_CRITERIA.map(c => [c.stage.toLowerCase(), c]))

/**
 * Criteria for a stage, or null when the stage has no defined scope. Null means
 * fall back to the full inspection framework rather than silently narrowing to
 * nothing, so a stage added later still produces useful output.
 */
export function criteriaForStage(stageName: string | null | undefined): StageCriteria | null {
  if (!stageName) return null
  return BY_STAGE.get(stageName.trim().toLowerCase()) ?? null
}

const DEFAULT_LABELS = new Map(DEFAULT_CHECKS.map(c => [c.id, c.label]))

/**
 * The stage scope block for the prompt. `labels` lets the caller supply the
 * labels from a live inspection, which may be customised in inspection_config,
 * falling back to the defaults.
 */
export function buildStageScopeBlock(
  criteria: StageCriteria,
  labels?: Map<string, string>,
): string {
  const lines = criteria.checkIds.map(id => `- ${labels?.get(id) ?? DEFAULT_LABELS.get(id) ?? id}`)
  return `STAGE SCOPE (mandatory):
This deal is at stage "${criteria.stage}". The purpose of this stage is to establish that ${criteria.maturity}.
${criteria.guideline}

Only these criteria are in scope at this stage:
${lines.join('\n')}

- Write items about the criteria above and nothing else. Ignore anything that belongs to an earlier or a later stage.
- Do not treat information as missing when it is not yet expected at this stage.
- Where a criterion above is already satisfied by the deal data or the notes, do not raise it. Say nothing rather than inventing a question.
- If every criterion above is satisfied, write the smallest number of items that remain genuinely useful, even if that is fewer than three.`
}
