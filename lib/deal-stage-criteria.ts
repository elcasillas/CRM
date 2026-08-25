import { DEFAULT_CHECKS } from './deal-inspect-checks'

// ── Stage-appropriate inspection scope ───────────────────────────────────────
// A deal early in the pipeline should not be questioned about things that are
// not yet expected of it. Each stage names the criteria that matter at that
// point, and follow-up generation is limited to them, so an Initial
// Conversation deal is never asked about contract terms and a Contract
// Negotiations deal is never asked to restate its business problem.
//
// checkIds are inspection check ids from DEFAULT_CHECKS, imported from the leaf
// module rather than from deal-inspect to avoid an import cycle, so the
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
  /** what the four summary sections should emphasise at this stage */
  summaryFocus: string
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
    summaryFocus:
      'whether the opportunity is real, the business need behind it, the current level of engagement, and the immediate next step. Do not raise contract terms, ACV or TCV, executive decision makers, the decision process, commitment level, or negotiation detail unless the notes already document them.',
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
    summaryFocus:
      'commercial and technical viability, scope, known risks, implementation timing, and qualification activity. Do not draw conclusions from later stage expectations such as executive approval, competitive shortlisting, or a path to signature.',
  },
  {
    stage: 'Presenting to EDM',
    maturity: 'the decision path is understood',
    guideline: 'Confirm access to the decision process and the people who can approve the opportunity.',
    checkIds: [
      'economic_buyer',
      'decision_process',
    ],
    summaryFocus:
      'who is involved in the decision, whether the executive decision maker is known, progress toward executive engagement, how the customer intends to evaluate and approve, and activity that bears directly on the decision process. Do not require evidence of final commitment or of contract negotiation unless the notes already document it.',
  },
  {
    stage: 'Short Listed',
    maturity: 'customer intent is demonstrated',
    guideline: 'Confirm the customer is seriously considering the solution and that there is evidence of competitive position and intent.',
    checkIds: [
      'customer_intent',
      'close_date_credible',
    ],
    summaryFocus:
      'evidence the customer is actively considering the solution, their commitment level, competitive position where known, the decision activity that remains, and whether the projected close date is still realistic. Do not introduce contract negotiation expectations unless negotiations have actually started and are documented.',
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
    summaryFocus:
      'current negotiation status, the commercial terms under discussion, remaining contractual or approval blockers, what is required to reach signature, who owns each critical next step, and the expected timing to signature.',
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

/**
 * The stage block for the deal summary. Scopes all four sections to the
 * expectations of the current stage, so nothing belonging to a later stage is
 * reported as missing or as a blocker.
 */
export function buildSummaryStageBlock(
  criteria: StageCriteria,
  labels?: Map<string, string>,
): string {
  const lines = criteria.checkIds.map(id => `- ${labels?.get(id) ?? DEFAULT_LABELS.get(id) ?? id}`)
  return `STAGE (mandatory):
This deal is at stage "${criteria.stage}". The purpose of this stage is to establish that ${criteria.maturity}.
${criteria.guideline}

The criteria that matter at this stage:
${lines.join('\n')}

Across all four sections, focus on ${criteria.summaryFocus}

- Write every section from the expectations of this stage alone. Do not assess the deal against a fuller checklist.
- Never describe information that belongs to a later stage as missing, lacking, or a deficiency.
- Earlier stage information may be referenced where it still materially affects the deal, but this stage sets what the summary is about.
- Current Blockers: only what actually impedes progress out of this stage. Information not yet expected is not a blocker. With none, say so plainly instead of manufacturing one.
- Timeline and Next Steps: describe what is required to progress toward the next stage. A milestone date that has passed is overdue, missed or completed, never upcoming, and say when a date needs updating.
- Do not invent a question, blocker, risk or next step to fill a section.`
}
