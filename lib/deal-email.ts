import type { InspectionResult } from './deal-inspect'
import { formatLastNoteLine } from './ai-date-context'

// ── Owner follow-up email generation ─────────────────────────────────────────
// Single source of truth for the "Email Owner" template. Both the Email Owner
// action (opens mailto:) and the Template action (copies to clipboard) call
// composeOwnerEmail so the two can never drift apart.

export interface ComposedEmail {
  subject: string
  body: string
  /** inspection returned alongside the email, when the API supplied one */
  inspection?: InspectionResult | null
}

/** Deal fields the offline fallback template needs. */
export interface FallbackDealInfo {
  deal_name: string
  deal_stages?: { stage_name: string } | null
  deal_owner?: { full_name: string | null } | null
}

/**
 * Local template used when the compose-email API is unavailable. Matches the
 * generated shape: deal name, last note line, then numbered items.
 */
export function fallbackOwnerEmail(deal: FallbackDealInfo, lastNoteAt?: string | null): ComposedEmail {
  const stageName = deal.deal_stages?.stage_name ?? 'unknown stage'
  const lastNoteLine = formatLastNoteLine(lastNoteAt, new Date())
  const items = [
    `1. What is the current status of this deal in ${stageName}?`,
    '2. What are the outstanding actions and who owns each one?',
    '3. What blockers are open right now, and what is needed to clear them?',
    '4. What is the current target date for the next milestone?',
  ].join('\n')
  return {
    subject: deal.deal_name,
    body: `${deal.deal_name}\n${lastNoteLine}\n\n${items}`,
  }
}

/**
 * Generate the owner follow-up email for a deal via the compose-email API,
 * falling back to the local template if the request fails or returns nothing.
 */
export async function composeOwnerEmail(dealId: string, deal: FallbackDealInfo, lastNoteAt?: string | null): Promise<ComposedEmail> {
  try {
    const res = await fetch(`/api/deals/${dealId}/compose-email`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      if (data.subject && data.body) {
        return { subject: data.subject, body: data.body, inspection: (data.inspection as InspectionResult) ?? null }
      }
    }
  } catch (_e) { /* fall through to local template */ }
  return fallbackOwnerEmail(deal, lastNoteAt)
}

/**
 * Plain-text rendering for clipboard use. The body already opens with the deal
 * name and last note line, so nothing is prepended.
 */
export function renderEmailText(email: ComposedEmail): string {
  return email.body
}

/** Copy text to the clipboard, with a fallback for non-secure contexts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (_e) { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch (_e) {
    return false
  }
}
